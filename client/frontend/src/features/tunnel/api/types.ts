export type TunnelMode = 'socks5' | 'port_forward' | 'reverse_port_map' | 'http_proxy' | 'udp_proxy'
export type TunnelStatus = 'running' | 'paused' | 'stopped' | 'error'
export type TunnelChannelStatus = 'pending' | 'active' | 'timeout' | 'closed' | 'failed'
export type SocksAuthMode = 'no_auth' | 'username_password'

export interface PaginationDto {
  page: number
  page_size: number
  total: number
  has_more: boolean
}

export interface TunnelViewDto {
  tunnel_id: string
  beacon_id: string
  // 'unknown' 表示服务端返回了契约之外的取值, 由下游 model 层兜底展示
  mode: TunnelMode | 'unknown'
  bind_host: string
  bind_port: number
  remote_host?: string
  remote_port?: number
  socks_auth_mode?: SocksAuthMode
  socks_udp_associate?: boolean
  status: TunnelStatus | 'unknown'
  active_channels: number
  bytes_in: number
  bytes_out: number
  created_at: string
  updated_at: string
  error_message?: string
}

export interface TunnelChannelViewDto {
  channel_id: string
  tunnel_id: string
  beacon_id: string
  target_address: string
  status: TunnelChannelStatus | 'unknown'
  bytes_in: number
  bytes_out: number
  reason?: string
  created_at: string
  updated_at: string
}

export interface TunnelListPageDto extends PaginationDto {
  items: TunnelViewDto[]
}

export interface TunnelChannelListPageDto extends PaginationDto {
  items: TunnelChannelViewDto[]
}

interface TunnelStartBase {
  beacon_id: string
  bind_host?: string
  bind_port: number
}

export interface Socks5NoAuthStartRequest extends TunnelStartBase {
  mode: 'socks5'
  socks_auth_mode: 'no_auth'
  socks_udp_associate: boolean
  socks_username?: never
  socks_password?: never
}

export interface Socks5PasswordStartRequest extends TunnelStartBase {
  mode: 'socks5'
  socks_auth_mode: 'username_password'
  socks_username: string
  socks_password: string
  socks_udp_associate: boolean
}

export interface PortForwardStartRequest extends TunnelStartBase {
  mode: 'port_forward'
  remote_host: string
  remote_port: number
}

export interface ReversePortMapStartRequest extends TunnelStartBase {
  mode: 'reverse_port_map'
  remote_host: string
  remote_port: number
}

export type StartTunnelRequest =
  | Socks5NoAuthStartRequest
  | Socks5PasswordStartRequest
  | PortForwardStartRequest
  | ReversePortMapStartRequest

export type UpdateTunnelRequest =
  | {
      bind_host?: string
      bind_port?: number
      socks_auth_mode?: SocksAuthMode
      socks_username?: string
      socks_password?: string
      socks_udp_associate?: boolean
      remote_host?: never
      remote_port?: never
    }
  | {
      bind_host?: string
      bind_port?: number
      remote_host?: string
      remote_port?: number
      socks_auth_mode?: never
      socks_username?: never
      socks_password?: never
      socks_udp_associate?: never
    }

export interface TunnelRecycleResult {
  recycled_count: number
}
