#include "beacon_test.h"
#include "beacon_commands.h"

#include <string.h>

/*
 * 参数解析安静失败回归场景。
 *
 * 契约（B1 修复后）：ParserString 解析失败返回 NULL 且 p->error 置位；
 * 各命令必须把协议截断显式上报为错误文本，不得继续执行并把失败伪装成
 * 误导性的下游文案（"MoveFileEx failed"/"Removed"/"OpenProcess failed"）。
 */

static const BYTE8 BE_ONE[4] = { 0, 0, 0, 1 };
static const BYTE8 BE_TWO[4] = { 0, 0, 0, 2 };

/* 追加一个大端长度前缀字符串参数 */
static VOID AppendCountedStr(ByteBuf* b, const CHAR* s)
{
    BYTE8 be_len[4];
    UINT32 len = (UINT32)strlen(s);

    be_len[0] = (BYTE8)(len >> 24);
    be_len[1] = (BYTE8)(len >> 16);
    be_len[2] = (BYTE8)(len >> 8);
    be_len[3] = (BYTE8)(len & 0xFF);
    PacketArrayBytes(b, be_len, sizeof(be_len));
    PacketArrayBytes(b, s, len);
}

/* 判断输出文本是否包含子串 */
static BOOL OutHas(const ByteBuf* out, const CHAR* needle)
{
    SIZE_T nlen = strlen(needle);
    SIZE_T i;

    if (!out->data || out->len < nlen) return FALSE;
    for (i = 0; i <= out->len - nlen; ++i) {
        if (memcmp(out->data + i, needle, nlen) == 0) return TRUE;
    }
    return FALSE;
}

/*
 * [count=2][一个字符串然后 EOF]：mv/cp 必须报协议解析错误，
 * 绝不能产出 "MoveFileEx failed"/"CopyFile failed" 这类下游文案。
 */
VOID BeaconTestScenarioParserMvCpTruncatedArgs(VOID)
{
    ByteBuf args;
    ByteBuf out;
    Parser parser;

    BbInit(&args);
    PacketArrayBytes(&args, BE_TWO, sizeof(BE_TWO));
    AppendCountedStr(&args, "C:\\Windows\\notepad.exe");
    /* 第二个字符串缺失 —— EOF 截断 */

    ParserInit(&parser, args.data, args.len);
    out = CommandMv(&parser);
    TEST_ASSERT(out.len > 0);
    TEST_ASSERT(OutHas(&out, "mv:"));
    TEST_ASSERT(!OutHas(&out, "MoveFileEx failed"));
    BbFree(&out);

    ParserInit(&parser, args.data, args.len);
    out = CommandCp(&parser);
    TEST_ASSERT(out.len > 0);
    TEST_ASSERT(OutHas(&out, "cp:"));
    TEST_ASSERT(!OutHas(&out, "CopyFile failed"));
    BbFree(&out);

    BbFree(&args);
}

/*
 * rm 截断参数：不得回报 "Removed"（旧实现在此谎报成功）。
 * cat/cd 同理不得产出 "open file failed"/"chdir failed"。
 */
VOID BeaconTestScenarioParserFsTruncatedSingleArg(VOID)
{
    ByteBuf args;
    ByteBuf out;
    Parser parser;

    /* [count=1][无字符串体] → ParseOnePath 必须显式失败 */
    BbInit(&args);
    PacketArrayBytes(&args, BE_ONE, sizeof(BE_ONE));

    ParserInit(&parser, args.data, args.len);
    out = CommandRm(&parser);
    TEST_ASSERT(!OutHas(&out, "Removed"));
    TEST_ASSERT(out.len > 0 && !OutHas(&out, "remove failed"));
    BbFree(&out);

    ParserInit(&parser, args.data, args.len);
    out = CommandCat(&parser);
    TEST_ASSERT(!OutHas(&out, "open file failed"));
    TEST_ASSERT(out.len > 0);
    BbFree(&out);

    /* cd 走独立解析路径，同样必须显式失败而非 "chdir failed" */
    ParserInit(&parser, args.data, args.len);
    out = CommandCd(&parser);
    TEST_ASSERT(!OutHas(&out, "chdir failed"));
    TEST_ASSERT(out.len > 0);
    BbFree(&out);

    BbFree(&args);

    /* 正常路径回归：有效目录 cd 后应回显新目录而非任何错误 */
    BbInit(&args);
    PacketArrayBytes(&args, BE_ONE, sizeof(BE_ONE));
    AppendCountedStr(&args, "C:\\Windows");
    ParserInit(&parser, args.data, args.len);
    out = CommandCd(&parser);
    TEST_ASSERT(!OutHas(&out, "cd:"));
    TEST_ASSERT(!OutHas(&out, "chdir failed"));
    BbFree(&out);
    BbFree(&args);
}

/*
 * kill/stealtoken 畸形包：[count=1][EOF 无 pid] 必须报协议错误，
 * 不得静默落到 pid=0 再报误导性的 "OpenProcess failed"。
 */
VOID BeaconTestScenarioParserKillStealTokenTruncated(VOID)
{
    ByteBuf args;
    ByteBuf out;
    Parser parser;

    BbInit(&args);
    PacketArrayBytes(&args, BE_ONE, sizeof(BE_ONE));

    ParserInit(&parser, args.data, args.len);
    out = CommandKill(&parser);
    TEST_ASSERT(out.len > 0);
    TEST_ASSERT(!OutHas(&out, "OpenProcess failed"));
    TEST_ASSERT(!OutHas(&out, "Process terminated"));
    BbFree(&out);

    ParserInit(&parser, args.data, args.len);
    out = CommandStealToken(&parser);
    TEST_ASSERT(out.len > 0);
    TEST_ASSERT(!OutHas(&out, "OpenProcess failed"));
    TEST_ASSERT(!OutHas(&out, "Successfully stole token"));
    BbFree(&out);

    BbFree(&args);
}
