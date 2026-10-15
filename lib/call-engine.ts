import type { ConversationCall,CallSignal } from "./conversation-types";
export type MediaFactory=(kind:"audio"|"video")=>Promise<MediaStream>;
export type CallEngineOptions={roomId:string;userId:string;clientId:string;request:(path:string,method?:string,body?:unknown)=>Promise<any>;mediaFactory?:MediaFactory;local:(s:MediaStream|null)=>void;remote:(s:MediaStream|null)=>void;state:(s:string)=>void;remoteMedia:(a:boolean,v:boolean)=>void;error:(s:string)=>void};
export class CallEngine {
  readonly options:CallEngineOptions;
  pc:RTCPeerConnection|null=null;stream:MediaStream|null=null;call:ConversationCall|null=null;side:"caller"|"callee"|null=null;
  audio=true;video=true;private pending:RTCIceCandidateInit[]=[];private heartbeat:ReturnType<typeof setInterval>|null=null;private connectionTimeout:ReturnType<typeof setTimeout>|null=null;private disconnectedTimeout:ReturnType<typeof setTimeout>|null=null;private initialising:Promise<void>|null=null;private closed=false;private generation=0;
  constructor(options:CallEngineOptions){this.options=options;}
  async prepare(kind:"audio"|"video"){
    this.closed=false;const generation=++this.generation;this.options.state("Requesting microphone"+(kind==="video"?" and camera":""));
    if(!navigator.mediaDevices?.getUserMedia&&!this.options.mediaFactory)throw Error("This browser cannot access a microphone or camera. Use a supported browser over HTTPS.");
    try{const stream=await (this.options.mediaFactory?this.options.mediaFactory(kind):navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:kind==="video"?{width:{ideal:960},height:{ideal:540}}:false}));if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());throw Error("Call cancelled.");}this.stream=stream;this.audio=true;this.video=kind==="video";this.options.local(this.stream);}catch(e){this.options.state("idle");throw Error(e instanceof Error&&["NotAllowedError","PermissionDeniedError"].includes(e.name)?"Microphone or camera permission was denied. Allow access in your browser, then try again.":e instanceof Error&&e.name==="NotFoundError"?"No suitable microphone or camera was found.":"The microphone or camera could not be started. Close other apps using it and try again.");}
  }
  async attach(call:ConversationCall){this.call=call;this.side=call.callerId===this.options.userId&&call.callerClientId===this.options.clientId?"caller":call.calleeId===this.options.userId&&call.calleeClientId===this.options.clientId?"callee":null;if(!this.side)return;this.options.state(call.status==="ringing"?"Calling…":"Connecting…");if(!this.heartbeat)this.heartbeat=setInterval(()=>void this.action("heartbeat").catch(()=>{}),12000);await this.update(call);}
  async update(call:ConversationCall|null){
    if(!this.call||!call||call.id!==this.call.id)return;this.call=call;
    if(!["ringing","active"].includes(call.status)){this.stop();return;}
    if(call.status!=="active"||this.pc||!this.stream||!this.side)return;
    if(this.initialising)return this.initialising;
    this.initialising=this.connect().finally(()=>{this.initialising=null;});return this.initialising;
  }
  private async connect(){
    try{const config=await this.options.request(`/api/conversations/ice?room=${encodeURIComponent(this.options.roomId)}`);if(this.closed||!this.stream)return;
      const pc=new RTCPeerConnection({iceServers:config.iceServers});this.pc=pc;const remote=new MediaStream();
      this.stream.getTracks().forEach(track=>pc.addTrack(track,this.stream!));
      pc.ontrack=event=>{if(this.closed)return;const tracks=event.streams[0]?.getTracks()??[event.track];for(const track of tracks)if(!remote.getTracks().some(t=>t.id===track.id))remote.addTrack(track);this.options.remote(remote);};
      pc.onicecandidate=event=>{if(event.candidate&&!this.closed)void this.send({type:"ice",candidate:event.candidate.toJSON()}).catch(e=>this.options.error(e.message));};
      pc.onconnectionstatechange=()=>{if(this.closed)return;const state=pc.connectionState;if(state==="connected"){if(this.connectionTimeout)clearTimeout(this.connectionTimeout);if(this.disconnectedTimeout)clearTimeout(this.disconnectedTimeout);this.options.state("Connected");}else if(state==="failed"){this.options.error("The call could not connect. Try another network or configure the call relay.");void this.hangup();}else if(state==="disconnected"){this.options.state("Reconnecting…");if(!this.disconnectedTimeout)this.disconnectedTimeout=setTimeout(()=>{this.options.error("The call disconnected. You can call again when the connection returns.");void this.hangup();},15000);}else if(state==="connecting")this.options.state("Connecting…");};
      this.connectionTimeout=setTimeout(()=>{if(pc.connectionState!=="connected"){this.options.error("The call could not connect within 40 seconds. A relay may be needed on this network.");void this.hangup();}},40000);
      if(this.side==="caller"){const offer=await pc.createOffer();if(this.closed)return;await pc.setLocalDescription(offer);await this.send({type:"description",description:{type:"offer",sdp:pc.localDescription!.sdp}});}
    }catch(e){this.options.error(e instanceof Error?e.message:"Call setup failed.");await this.hangup();}
  }
  async receive(signal:CallSignal){
    if(signal.type==="media"){this.options.remoteMedia(signal.audio,signal.video);return;}
    if(!this.pc||this.closed)return;
    if(signal.type==="ice"){if(!this.pc.remoteDescription)this.pending.push(signal.candidate);else await this.pc.addIceCandidate(signal.candidate);return;}
    if(signal.description.type==="offer"&&this.side!=="callee")return;if(signal.description.type==="answer"&&this.side!=="caller")return;
    await this.pc.setRemoteDescription(signal.description);for(const candidate of this.pending)await this.pc.addIceCandidate(candidate);this.pending=[];
    if(signal.description.type==="offer"){const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);await this.send({type:"description",description:{type:"answer",sdp:this.pc.localDescription!.sdp}});}
  }
  action(action:string,extra:unknown={}){return this.options.request("/api/conversations/call","POST",{roomId:this.options.roomId,clientId:this.options.clientId,callId:this.call?.id,action,...extra as object});}
  send(signal:CallSignal){return this.action("signal",{signal,nonce:crypto.randomUUID()});}
  toggleAudio(){this.audio=!this.audio;this.stream?.getAudioTracks().forEach(t=>t.enabled=this.audio);if(this.call?.status==="active")void this.send({type:"media",audio:this.audio,video:this.video}).catch(()=>{});return this.audio;}
  toggleVideo(){this.video=!this.video;this.stream?.getVideoTracks().forEach(t=>t.enabled=this.video);if(this.call?.status==="active")void this.send({type:"media",audio:this.audio,video:this.video}).catch(()=>{});return this.video;}
  async hangup(){const call=this.call;this.stop();if(call)try{await this.options.request("/api/conversations/call","POST",{roomId:this.options.roomId,clientId:this.options.clientId,callId:call.id,action:"hangup"});}catch{this.options.error("The call ended on this device. The other participant may see it until the connection timeout.");}}
  stop(){this.closed=true;this.generation++;if(this.heartbeat)clearInterval(this.heartbeat);if(this.connectionTimeout)clearTimeout(this.connectionTimeout);if(this.disconnectedTimeout)clearTimeout(this.disconnectedTimeout);this.heartbeat=null;this.connectionTimeout=null;this.disconnectedTimeout=null;this.pc?.close();this.pc=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.pending=[];this.call=null;this.side=null;this.options.local(null);this.options.remote(null);this.options.state("idle");}
  destroy(){const call=this.call;this.stop();if(call)void fetch("/api/conversations/call",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({roomId:this.options.roomId,clientId:this.options.clientId,callId:call.id,action:"hangup"}),keepalive:true}).catch(()=>{});}
}
