export type MessageType =
  | "register" | "welcome" | "peer_list" | "peer_joined" | "peer_left" | "peer_updated" | "update_status"
  | "connect_request" | "connect_accept" | "connect_reject" | "connect_cancel"
  | "sdp_offer" | "sdp_answer" | "ice_candidate"
  | "pair_link" | "pair_joined" | "pair_error"

export interface BaseMessage { type: MessageType }

export interface WelcomeMessage extends BaseMessage {
  type: "welcome"
  device_id: string
  session_secret?: string
  resumed?: boolean
  room?: RoomInfo
}
export interface RoomInfo {
  ip_version: 4 | 6
  hint: string
}
export interface PeerListMessage extends BaseMessage {
  type: "peer_list"
  peers: Peer[]
}
export interface PeerJoinedMessage extends BaseMessage {
  type: "peer_joined"
  device_id: string
  device_name: string
  device_type: string
  is_busy: boolean
}
export interface PeerLeftMessage extends BaseMessage {
  type: "peer_left"
  device_id: string
}
export interface ConnectRequestMessage extends BaseMessage {
  type: "connect_request"
  from_id: string
  to: string
}
export interface ConnectResponseMessage extends BaseMessage {
  type: "connect_accept" | "connect_reject"
  from_id: string
  to: string
}
export interface ConnectCancelMessage extends BaseMessage {
  type: "connect_cancel"
  from_id: string
  to: string
}
export interface SDPMessage extends BaseMessage {
  type: "sdp_offer" | "sdp_answer"
  from_id: string
  to: string
  sdp: RTCSessionDescriptionInit
  rebuild?: boolean
}
export interface ICEMessage extends BaseMessage {
  type: "ice_candidate"
  from_id: string
  to: string
  candidate: RTCIceCandidateInit
}

export interface Peer {
  device_id: string
  device_name: string
  device_type: string
  is_busy: boolean
  is_linked?: boolean
}

export type PairErrorReason = "invalid" | "self"

export interface PairLinkMessage extends BaseMessage {
  type: "pair_link"
  token: string
  expires_in: number
}
export interface PairJoinedMessage extends BaseMessage {
  type: "pair_joined"
  peer: Peer
}
export interface PairErrorMessage extends BaseMessage {
  type: "pair_error"
  reason: PairErrorReason
}

export interface PeerUpdatedMessage extends BaseMessage {
  type: "peer_updated"
  device_id: string
  device_name: string
  device_type: string
  is_busy: boolean
}

export type WSMessage =
  | WelcomeMessage | PeerListMessage | PeerJoinedMessage | PeerLeftMessage | PeerUpdatedMessage
  | ConnectRequestMessage | ConnectResponseMessage | ConnectCancelMessage | SDPMessage | ICEMessage
  | PairLinkMessage | PairJoinedMessage | PairErrorMessage
