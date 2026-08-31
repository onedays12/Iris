#include "beacon_test.h"
#include "beacon_tunnel_internal.h"
#include "beacon_commands.h"

#include <string.h>

/*
 * tunnel 场景测试
 *
 * 1. 公平轮询游标（poll_rotate）：
 *    单批字节预算截断后游标必须被播种为非 NULL，下一 tick 从该通道之后继续，
 *    否则头部大流量通道永久独占预算、后方通道饥饿。
 * 2. SplitTarget 边界：target 字符串来自控制端（不可信），service 段超长时
 *    必须被拒绝而不是触发 CRT invalid parameter handler 终止进程。
 * 3. CommandLs 边界：超长目录名必须返回错误文本而不是 swprintf_s 截断崩溃。
 */

/* tunnel_server.c 的私有预算常量；此处按行为等价镜像一份用于构造积压量 */
#define TEST_BATCH_MAX_BYTES (1024 * 1024)
#define TEST_BIG_PKT_LEN     (17 * 1024) /* 17KB：64 包上限之前先触达 1MB 字节预算 */
#define TEST_HEAD_PKTS       170         /* 约 2.96MB 队列，两轮都无法在预算内排空 */

/* 在缓冲区中查找子串（避免依赖平台 memmem） */
static BOOL TestContains(const BYTE8* data, SIZE_T len, const CHAR* needle)
{
    SIZE_T nlen = strlen(needle);
    SIZE_T i;

    if (!data || nlen == 0 || len < nlen) return FALSE;
    for (i = 0; i <= len - nlen; ++i) {
        if (memcmp(data + i, needle, nlen) == 0) return TRUE;
    }
    return FALSE;
}

/* 判断包列表中是否存在含指定标记的数据包 */
static BOOL TestContainsOnList(const PacketList* list, const CHAR* needle)
{
    SIZE_T i;

    for (i = 0; i < list->count; ++i) {
        if (TestContains(list->items[i].data, list->items[i].len, needle)) {
            return TRUE;
        }
    }
    return FALSE;
}

/* 构造一个填充指定字符的堆分配数据包 */
static ByteBuf TestMakeFilledPacket(BYTE8 fill, SIZE_T len)
{
    ByteBuf b;

    BbInit(&b);
    BbReserve(&b, len);
    if (b.data) {
        memset(b.data, fill, len);
        b.len = len;
    }
    return b;
}

static TunnelChannel* TestMakeChannel(TunnelManager* tm, const CHAR* cid)
{
    TunnelChannel* ch =
        (TunnelChannel*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*ch));

    if (!ch) return NULL;
    strcpy_s(ch->tunnel_id, sizeof(ch->tunnel_id), "tb_t");
    strcpy_s(ch->channel_id, sizeof(ch->channel_id), cid);
    strcpy_s(ch->proto, sizeof(ch->proto), "tcp");
    strcpy_s(ch->mode, sizeof(ch->mode), "port_forward");
    ch->socket_handle = INVALID_SOCKET;
    ch->owner = tm;
    ch->created_at = GetTickCount64();
    ch->last_seen = ch->created_at;
    InitializeConditionVariable(&ch->data_cv);
    return ch;
}

/* 前插通道到管理器链表（语义与生产 TunnelManagerAdd 的挂链部分一致） */
static VOID TestLinkChannel(TunnelManager* tm, TunnelChannel* ch)
{
    ch->next = tm->channels;
    tm->channels = ch;
    ++tm->channel_count;
}

/* 复刻 worker 入队路径（队列远小于上限，不会阻塞） */
static VOID TestEnqueueData(TunnelManager* tm, TunnelChannel* ch, ByteBuf packet)
{
    TunnelPendingPacket* node;

    if (!packet.data) return;
    node = (TunnelPendingPacket*)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, sizeof(*node));
    if (!node) {
        BbFree(&packet);
        return;
    }
    node->packet = packet;
    EnterCriticalSection(&tm->lock);
    if (ch->data_tail) {
        ch->data_tail->next = node;
    } else {
        ch->data_head = node;
    }
    ch->data_tail = node;
    ++ch->data_count;
    ++tm->data_count;
    LeaveCriticalSection(&tm->lock);
}

/* 释放列表中全部包（测试自消费 poll 返回值用） */
static VOID TestFreePackets(PacketList* list)
{
    SIZE_T i;
    for (i = 0; i < list->count; ++i) {
        BbFree(&list->items[i]);
    }
    PlistFree(list);
}

/* 手动回收：释放残留队列与通道结构，最后经 TunnelFree 删除管理器锁 */
static VOID TeardownChannels(TunnelManager* tm, TunnelChannel** chans, SIZE_T n)
{
    SIZE_T i;

    (VOID)tm;
    EnterCriticalSection(&tm->lock);
    for (i = 0; i < n; ++i) {
        TunnelChannel* ch = chans[i];
        TunnelPendingPacket* node;

        if (!ch) continue;
        node = ch->data_head;
        while (node) {
            TunnelPendingPacket* next = node->next;
            BbFree(&node->packet);
            HeapFree(GetProcessHeap(), 0, node);
            node = next;
        }
        SecureZeroMemory(ch, sizeof(*ch));
        HeapFree(GetProcessHeap(), 0, ch);
        chans[i] = NULL;
    }
    tm->channels = NULL;
    tm->channel_count = 0;
    tm->data_count = 0;
    LeaveCriticalSection(&tm->lock);

    TunnelFree(tm); /* 空表安全：仅删除临界区 */
}

/*
 * 场景：单通道积压超过单批字节预算时，一次 TunnelPoll 只能部分排空，
 * 此后 poll_rotate 游标必须指向有效通道（跨 tick 轮转的种子）。
 */
VOID BeaconTestScenarioTunnelPollRotateCursor(VOID)
{
    TunnelManager tm;
    TunnelChannel* chans[3];
    PacketList out;
    SIZE_T i;

    ZeroMemory(&tm, sizeof(tm));
    tm.ctx = NULL;
    InitializeCriticalSection(&tm.lock);

    /* 依次前插 A、B、C → 链表（头→尾）：C(大积压) -> B -> A */
    chans[2] = TestMakeChannel(&tm, "tb_c");
    chans[1] = TestMakeChannel(&tm, "tb_b");
    chans[0] = TestMakeChannel(&tm, "tb_a");
    if (!chans[0] || !chans[1] || !chans[2]) goto cleanup;
    TestLinkChannel(&tm, chans[0]);
    TestLinkChannel(&tm, chans[1]);
    TestLinkChannel(&tm, chans[2]);

    for (i = 0; i < TEST_HEAD_PKTS; ++i) {
        TestEnqueueData(&tm, chans[2], TestMakeFilledPacket('C', TEST_BIG_PKT_LEN));
    }
    TEST_ASSERT(tm.data_count == TEST_HEAD_PKTS);

    out = TunnelPoll(&tm);

    /* 第一个失败点（修复前）：budget 截断后游标仍为 NULL */
    TEST_ASSERT(out.count > 0);
    TEST_ASSERT(tm.data_count > 0);           /* 头部积压未在本 tick 排空 */
    TEST_ASSERT(tm.poll_rotate != NULL);      /* 注释承诺的“下一 tick 起始通道” */

    TestFreePackets(&out);

cleanup:
    TeardownChannels(&tm, chans, 3);
}

/*
 * 场景：头部通道持续积压超过预算时，第二个 tick 也必须服务后方通道，
 * 即注释承诺的跨 tick 公平，而非每 tick 都从表头重新开始。
 */
VOID BeaconTestScenarioTunnelPollFairnessCrossTick(VOID)
{
    TunnelManager tm;
    TunnelChannel* chans[3];
    PacketList out;
    BOOL starved_channel_served = FALSE;
    SIZE_T i;

    ZeroMemory(&tm, sizeof(tm));
    tm.ctx = NULL;
    InitializeCriticalSection(&tm.lock);

    /* 依次前插 A、B、C → 链表（头→尾）：C(持续大流量) -> B(低流量观察对象) -> A */
    chans[2] = TestMakeChannel(&tm, "ft_c");
    chans[1] = TestMakeChannel(&tm, "ft_b");
    chans[0] = TestMakeChannel(&tm, "ft_a");
    if (!chans[0] || !chans[1] || !chans[2]) goto cleanup;
    TestLinkChannel(&tm, chans[0]);
    TestLinkChannel(&tm, chans[1]);
    TestLinkChannel(&tm, chans[2]);

    for (i = 0; i < TEST_HEAD_PKTS; ++i) {
        TestEnqueueData(&tm, chans[2], TestMakeFilledPacket('C', TEST_BIG_PKT_LEN));
    }
    TestEnqueueData(&tm, chans[1], BbFromText("TB_FAIRNESS_MARKER_B"));

    /* Tick1：预算内只可能从表头 C 排空 */
    out = TunnelPoll(&tm);
    TEST_ASSERT(out.count > 0);
    TEST_ASSERT(!TestContainsOnList(&out, "TB_FAIRNESS_MARKER_B"));
    TestFreePackets(&out);

    /* 第二个失败点（修复前）：tick2 从表头重启，B 的标记包不会被服务 */
    out = TunnelPoll(&tm);
    starved_channel_served = TestContainsOnList(&out, "TB_FAIRNESS_MARKER_B");
    TEST_ASSERT(starved_channel_served);
    TestFreePackets(&out);

cleanup:
    TeardownChannels(&tm, chans, 3);
}

/*
 * 场景：target 解析对不可信输入的边界。service 段超过 32 字节缓冲时旧实现
 * 直接 strcpy_s → CRT invalid parameter handler → 进程终止。
 * 测试钩子与生产代码共享同一实现（TunnelDialTarget 内部调用同一函数）。
 */
VOID BeaconTestScenarioTunnelSplitTargetBounds(VOID)
{
    CHAR host[256];
    CHAR service[32];
    CHAR target[640];

    /* 常规矩阵回归 */
    TEST_ASSERT(TunnelTestSplitTarget("192.168.1.10:4444",
                                      host, sizeof(host), service, sizeof(service)));
    TEST_ASSERT(strcmp(host, "192.168.1.10") == 0 && strcmp(service, "4444") == 0);

    TEST_ASSERT(TunnelTestSplitTarget("[fe80::1]:8080",
                                      host, sizeof(host), service, sizeof(service)));
    TEST_ASSERT(strcmp(host, "fe80::1") == 0 && strcmp(service, "8080") == 0);

    TEST_ASSERT(!TunnelTestSplitTarget("", host, sizeof(host), service, sizeof(service)));
    TEST_ASSERT(!TunnelTestSplitTarget("host-only-no-port",
                                       host, sizeof(host), service, sizeof(service)));
    TEST_ASSERT(!TunnelTestSplitTarget("host:",
                                       host, sizeof(host), service, sizeof(service)));
    TEST_ASSERT(!TunnelTestSplitTarget(":8080",
                                       host, sizeof(host), service, sizeof(service)));
    TEST_ASSERT(!TunnelTestSplitTarget("[fe80::1]",
                                       host, sizeof(host), service, sizeof(service)));

    /* 关键负例：超长 service。修复前在这里直接进程自杀（__fastfail）。 */
    memset(target, 0, sizeof(target));
    memcpy(target, "10.0.0.1:", 9);
    memset(target + 9, '9', 600);
    TEST_ASSERT(!TunnelTestSplitTarget(target,
                                       host, sizeof(host), service, sizeof(service)));

    /* IPv6 方括号形式的同款负例 */
    memset(target, 0, sizeof(target));
    memcpy(target, "[fe80::1]:", 10);
    memset(target + 10, '9', 600);
    TEST_ASSERT(!TunnelTestSplitTarget(target,
                                       host, sizeof(host), service, sizeof(service)));
}

/*
 * 场景：CommandLs 对超长目录名的防御。dir 来自控制端参数，修复前
 * swprintf_s(pattern, ..., L"%s\\*", dir) 截断即触发 CRT invalid parameter
 * handler → 进程终止（若本测试回归，现象是整个测试 exe 消失而非断言失败）。
 */
VOID BeaconTestScenarioFsLsPathTooLong(VOID)
{
    ByteBuf args;
    ByteBuf out;
    Parser parser;
    CHAR long_dir[1200];
    static const BYTE8 be_one[4] = { 0, 0, 0, 1 }; /* ParserU32 为大端 */
    BYTE8 be_len[4];

    memset(long_dir, 'a', sizeof(long_dir) - 1);
    long_dir[sizeof(long_dir) - 1] = 0;

    /* 手工构造与生产一致的参数线格式：[BE32 count][BE32 str_len][utf8 bytes] */
    BbInit(&args);
    PacketArrayBytes(&args, be_one, sizeof(be_one));
    be_len[0] = 0;
    be_len[1] = 0;
    be_len[2] = (BYTE8)((sizeof(long_dir) - 1) >> 8);
    be_len[3] = (BYTE8)((sizeof(long_dir) - 1) & 0xFF);
    PacketArrayBytes(&args, be_len, sizeof(be_len));
    PacketArrayBytes(&args, long_dir, sizeof(long_dir) - 1);

    ParserInit(&parser, args.data, args.len);
    out = CommandLs(&parser);
    TEST_ASSERT(out.len > 0);
    TEST_ASSERT(TestContains(out.data, out.len, "path too long"));
    BbFree(&args);
    BbFree(&out);

    /* 常规路径回归：合法目录仍能列出内容（用系统目录） */
    {
        const CHAR* win_dir = "C:\\Windows";
        SIZE_T wlen = strlen(win_dir);

        BbInit(&args);
        PacketArrayBytes(&args, be_one, sizeof(be_one));
        be_len[2] = (BYTE8)(wlen >> 8);
        be_len[3] = (BYTE8)(wlen & 0xFF);
        PacketArrayBytes(&args, be_len, sizeof(be_len));
        PacketArrayBytes(&args, win_dir, wlen);

        ParserInit(&parser, args.data, args.len);
        out = CommandLs(&parser);
        TEST_ASSERT(out.len > 0);
        TEST_ASSERT(!TestContains(out.data, out.len, "path too long"));
        TEST_ASSERT(!TestContains(out.data, out.len, "FindFirstFile failed"));
        BbFree(&args);
        BbFree(&out);
    }
}
