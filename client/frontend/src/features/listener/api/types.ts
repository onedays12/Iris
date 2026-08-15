export type ListenerStatus = 'starting' | 'started' | 'paused' | 'stopped' | 'error' | 'removed'

export interface ListenerViewDto {
  id: string
  name: string
  protocol: string
  bind_addr: string
  bind_port: number
  status: ListenerStatus
  listener_type: string
  config: string
  created_at: string
  updated_at: string
}

export interface ListenerStagerRequest {
  bind_host: string
  bind_port: number
  callback_host: string
  callback_port: number
}

interface ListenerRequestBase {
  name: string
  encrypt_key: string
  profile?: string
}

export interface ExternalHttpListenerRequest extends ListenerRequestBase {
  protocol: 'http' | 'https'
  listener_type: 'external'
  profile: string
  host: string
  port: number
  callback_host: string
  callback_port: number
  ssl_cert?: string
  ssl_key?: string
  stager?: ListenerStagerRequest
}

export interface ExternalTcpListenerRequest extends ListenerRequestBase {
  protocol: 'tcp'
  listener_type: 'external'
  profile: string
  host: string
  port: number
  callback_host: string
  callback_port: number
  ssl?: boolean
  ssl_cert?: string
  ssl_key?: string
}

export interface InternalTcpListenerRequest extends ListenerRequestBase {
  protocol: 'tcp'
  listener_type: 'internal'
  bind_host: string
  bind_port: number
  connect_timeout?: number
}

export interface InternalSmbListenerRequest extends ListenerRequestBase {
  protocol: 'smb'
  listener_type: 'internal'
  pipe_name: string
  connect_timeout?: number
}

export type ListenerCreateRequest =
  | ExternalHttpListenerRequest
  | ExternalTcpListenerRequest
  | InternalTcpListenerRequest
  | InternalSmbListenerRequest

export type ListenerEditRequest = ListenerCreateRequest

export interface ListenerNameRequest {
  name: string
}
