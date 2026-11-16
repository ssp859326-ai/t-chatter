import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
import { supabaseConfig } from "./supabase-config.js";

const sb = createClient(supabaseConfig.url, supabaseConfig.publishableKey);
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stamp = value => value ? new Date(value).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "";
let user=null, activeChat=null, messageCache=[], chatChannel=null, messageChannel=null, statusChannel=null, signalChannel=null;
let recorder=null, recordedChunks=[], localStream=null, peer=null, currentCall=null, pendingIce=[];

function notice(message){$("sectionLabel").textContent=message;}
function clearChannel(channel){if(channel)sb.removeChannel(channel);}
function showView(name){
  $("listView").classList.toggle("hidden",name!=="chats");
  $("updatesView").classList.toggle("hidden",name!=="updates");
  $("callsView").classList.toggle("hidden",name!=="calls");
  $("conversation").classList.add("hidden");
  $("newChat").classList.toggle("hidden",name!=="chats");
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.tab===name));
}
function resetConversation(){
  activeChat=null;messageCache=[];
  clearChannel(messageChannel);messageChannel=null;
  $("conversation").classList.add("hidden");$("listView").classList.remove("hidden");
  $("composer").classList.remove("hidden");
}
async function signedUrl(path){
  const {data,error}=await sb.storage.from("t-chatter-media").createSignedUrl(path,3600);
  if(error)throw error;return data.signedUrl;
}
function drawMessages(){
  const box=$("messages");box.replaceChildren();
  for(const m of messageCache){
    const bubble=document.createElement("div");
    bubble.className="bubble "+(m.sender_id===user?.id?"sent":"received");
    if(m.body){const text=document.createElement("div");text.textContent=m.body;bubble.appendChild(text);}
    const meta=document.createElement("span");meta.textContent=stamp(m.created_at);bubble.appendChild(meta);
    if(m.media_path){
      signedUrl(m.media_path).then(url=>{
        if(!bubble.isConnected)return;
        const media=m.media_type||"";
        const el=document.createElement(media.startsWith("audio/")?"audio":media.startsWith("video/")?"video":"img");
        if(el.tagName==="AUDIO"||el.tagName==="VIDEO")el.controls=true;
        if(el.tagName==="VIDEO")el.playsInline=true;
        el.src=url;bubble.insertBefore(el,meta);
      }).catch(()=>{});
    }
    box.appendChild(bubble);
  }
  box.scrollTop=box.scrollHeight;
}
function addChatRow(chat){
  const button=document.createElement("button");button.className="chat-row";
  button.innerHTML='<div class="avatar">'+esc((chat.name||"T").slice(0,1).toUpperCase())+'</div><div class="chat-meta"><div class="chat-top"><strong>'+esc(chat.name||"T-Chatter user")+'</strong><span class="time">'+esc(stamp(chat.updated_at||chat.created_at))+'</span></div><div class="preview">'+esc(chat.last_message||"Start a conversation")+'</div></div>';
  button.addEventListener("click",()=>openChat(chat));$("chatList").appendChild(button);
}
async function renderChats(){
  if(!user)return;
  clearChannel(chatChannel);chatChannel=null;
  const {data:memberships,error:memberError}=await sb.from("chat_members").select("chat_id").eq("user_id",user.id);
  if(memberError){notice("Chats unavailable: "+memberError.message);return;}
  const ids=[...new Set((memberships||[]).map(x=>x.chat_id))];$("chatList").replaceChildren();
  if(!ids.length){$("chatList").innerHTML='<div class="updates-card">No chats yet. Tap + to find someone by username.</div>';}
  else{
    const {data:chats,error}=await sb.from("chats").select("id,title,is_group,created_at").in("id",ids).order("created_at",{ascending:false});
    if(error){notice("Chats unavailable: "+error.message);return;}
    for(const chat of chats||[]){
      const {data:members}=await sb.from("chat_members").select("user_id").eq("chat_id",chat.id);
      const other=(members||[]).find(m=>m.user_id!==user.id);if(!other)continue;
      const {data:profile}=await sb.from("usernames").select("username").eq("user_id",other.user_id).maybeSingle();
      const {data:last}=await sb.from("messages").select("body,created_at").eq("chat_id",chat.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
      addChatRow({...chat,name:profile?.username||"T-Chatter user",recipientId:other.user_id,last_message:last?.body||"Start a conversation",updated_at:last?.created_at||chat.created_at});
    }
  }
  chatChannel=sb.channel("chat-list-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"messages"},()=>void renderChats()).subscribe();
}
async function openChat(chat){
  activeChat=chat;$("chatName").textContent=chat.name||"Chat";$("chatAvatar").textContent=(chat.name||"T").slice(0,1).toUpperCase();$("chatPresence").textContent="T-Chatter contact";
  $("listView").classList.add("hidden");$("updatesView").classList.add("hidden");$("callsView").classList.add("hidden");$("conversation").classList.remove("hidden");$("newChat").classList.add("hidden");$("composer").classList.remove("hidden");
  clearChannel(messageChannel);messageChannel=null;
  const {data,error}=await sb.from("messages").select("id,chat_id,sender_id,body,media_path,media_type,created_at").eq("chat_id",chat.id).order("created_at",{ascending:true}).limit(300);
  if(error){notice("Messages unavailable: "+error.message);return;}
  messageCache=data||[];drawMessages();
  messageChannel=sb.channel("messages-"+chat.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"chat_id=eq."+chat.id},payload=>{
    if(!messageCache.some(m=>m.id===payload.new.id)){messageCache.push(payload.new);drawMessages();}
  }).subscribe();
}
async function startChat(){
  const name=prompt("Enter the T-Chatter username:");
  if(!name)return;
  const username=name.trim().toLowerCase();
  const {data:other,error}=await sb.from("usernames").select("user_id,username").eq("username",username).maybeSingle();
  if(error||!other){alert("No T-Chatter user found with that username.");return;}
  if(other.user_id===user.id){alert("You cannot start a chat with yourself.");return;}
  const {data:existingMembers}=await sb.from("chat_members").select("chat_id").eq("user_id",user.id);
  for(const item of existingMembers||[]){
    const {data:members}=await sb.from("chat_members").select("user_id").eq("chat_id",item.chat_id);
    if((members||[]).some(m=>m.user_id===other.user_id)){
      const {data:chat}=await sb.from("chats").select("id,title,is_group,created_at").eq("id",item.chat_id).maybeSingle();
      if(chat){await openChat({...chat,name:other.username,recipientId:other.user_id});return;}
    }
  }
  const {data:chat,error:createError}=await sb.from("chats").insert({created_by:user.id,participant_id:other.user_id,title:null,is_group:false}).select("id,created_at").single();
  if(createError){alert(createError.message);return;}
  const {error:memberError}=await sb.from("chat_members").insert([{chat_id:chat.id,user_id:user.id,role:"member"},{chat_id:chat.id,user_id:other.user_id,role:"member"}]);
  if(memberError){alert(memberError.message);return;}
  await renderChats();await openChat({id:chat.id,name:other.username,recipientId:other.user_id,created_at:chat.created_at});
}
async function sendMessage(){
  const body=$("messageInput").value.trim();if(!body||!activeChat||!user)return;
  $("sendBtn").disabled=true;
  const {error}=await sb.from("messages").insert({chat_id:activeChat.id,sender_id:user.id,body});
  $("sendBtn").disabled=false;
  if(error){notice("Message not sent: "+error.message);return;}
  $("messageInput").value="";$("messageInput").focus();
}
async function toggleRecording(){
  if(recorder?.state==="recording"){recorder.stop();$("recordBtn").classList.remove("recording");$("recordBtn").textContent="🎙";return;}
  if(!activeChat||!user){alert("Open a chat first.");return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){alert("Voice recording is not supported in this browser.");return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const mime=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(x=>MediaRecorder.isTypeSupported(x));
    recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recordedChunks=[];
    recorder.ondataavailable=e=>{if(e.data.size)recordedChunks.push(e.data);};
    recorder.onstop=async()=>{
      const blob=new Blob(recordedChunks,{type:recorder.mimeType||"audio/webm"});
      stream.getTracks().forEach(t=>t.stop());
      if(blob.size>15*1024*1024){alert("Voice note is too large. Please record a shorter note.");return;}
      const ext=blob.type.includes("mp4")?"m4a":"webm",path=user.id+"/"+activeChat.id+"/"+crypto.randomUUID()+"."+ext;
      const up=await sb.storage.from("t-chatter-media").upload(path,blob,{contentType:blob.type,upsert:false});
      if(up.error){notice("Voice note upload failed: "+up.error.message);return;}
      const ins=await sb.from("messages").insert({chat_id:activeChat.id,sender_id:user.id,body:"",media_path:path,media_type:blob.type});
      if(ins.error)notice("Voice note could not be sent: "+ins.error.message);
    };
    recorder.start();$("recordBtn").classList.add("recording");$("recordBtn").textContent="■";
  }catch(e){alert("Microphone permission is needed to record a voice note.");}
}
async function postStatus(){
  if(!user)return;
  const caption=$("statusText").value.trim(),file=$("statusFile").files?.[0];
  if(!caption&&!file){alert("Write a status or choose a photo/video.");return;}
  let path=null,type=null;
  if(file){
    if(file.size>50*1024*1024){alert("Choose a file smaller than 50 MB.");return;}
    path=user.id+"/statuses/"+crypto.randomUUID()+"-"+file.name.replace(/[^a-z0-9._-]/gi,"_");
    const {error}=await sb.storage.from("t-chatter-media").upload(path,file,{contentType:file.type,upsert:false});
    if(error){alert("Upload failed: "+error.message);return;}type=file.type;
  }
  const {error}=await sb.from("statuses").insert({user_id:user.id,caption:caption||null,media_path:path,media_type:type});
  if(error){alert("Status could not be shared: "+error.message);return;}
  $("statusText").value="";$("statusFile").value="";await loadStatuses();
}
async function loadStatuses(){
  const {data,error}=await sb.from("statuses").select("id,user_id,caption,media_path,media_type,created_at,expires_at").gt("expires_at",new Date().toISOString()).order("created_at",{ascending:false}).limit(100);
  if(error){$("statusList").textContent="Updates could not load.";return;}
  const list=$("statusList");list.replaceChildren();
  if(!data?.length){list.innerHTML='<div class="updates-card">No updates yet. Share the first one.</div>';return;}
  for(const item of data){
    const {data:profile}=await sb.from("usernames").select("username").eq("user_id",item.user_id).maybeSingle();
    const row=document.createElement("div");row.className="status-item";
    const copy=document.createElement("div");copy.className="status-copy";copy.textContent=(profile?.username||"T-Chatter user")+": "+(item.caption||"Shared a moment");
    const small=document.createElement("small");small.textContent=new Date(item.created_at).toLocaleString()+" · expires in 24 hours";copy.appendChild(small);
    row.appendChild(copy);
    if(item.media_path){try{const url=await signedUrl(item.media_path);const el=document.createElement(item.media_type?.startsWith("video/")?"video":"img");if(el.tagName==="VIDEO"){el.controls=true;el.playsInline=true;}el.src=url;row.insertBefore(el,copy);}catch{}}
    list.appendChild(row);
  }
}
function setCallStatus(text){$("callStatus").textContent=text;}
function showCall(video,label){$("callOverlay").classList.remove("hidden");$("callLabel").textContent=label;$("remoteVideo").classList.toggle("hidden",!video);$("localVideo").classList.toggle("hidden",!video);}
async function sendSignal(kind,payload={},recipient=currentCall?.peerId,callId=currentCall?.id){
  if(!recipient||!callId)return;
  const {error}=await sb.from("call_signals").insert({call_id:callId,sender_id:user.id,recipient_id:recipient,chat_id:currentCall.chatId,kind,payload});
  if(error)console.warn("Call signal:",error.message);
}
function makePeer(video){
  peer=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun.cloudflare.com:3478"}]});
  peer.onicecandidate=e=>{if(e.candidate)void sendSignal("ice",e.candidate.toJSON());};
  peer.ontrack=e=>{
    const stream=e.streams[0];
    if(video){$("remoteVideo").srcObject=stream;}else{$("remoteAudio").srcObject=stream;}
  };
  peer.onconnectionstatechange=()=>{if(peer?.connectionState==="connected")setCallStatus("Connected");if(["failed","disconnected"].includes(peer?.connectionState))setCallStatus("Connection interrupted. Check your network.");};
  if(localStream)localStream.getTracks().forEach(track=>peer.addTrack(track,localStream));
}
async function startCall(video){
  if(!activeChat?.recipientId){alert("Open a chat with a T-Chatter contact first.");return;}
  if(!navigator.mediaDevices?.getUserMedia){alert("Calls need a secure HTTPS connection and browser microphone/camera permissions.");return;}
  try{
    currentCall={id:crypto.randomUUID(),peerId:activeChat.recipientId,chatId:activeChat.id,video};
    localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:!!video});
    $("localVideo").srcObject=video?localStream:null;showCall(video,video?"Video calling…":"Voice calling…");setCallStatus("Calling "+activeChat.name+"…");
    makePeer(video);
    const offer=await peer.createOffer();await peer.setLocalDescription(offer);
    await sendSignal("offer",{sdp:offer,video});
  }catch(e){await finishCall(false);alert("Could not start the call. Check microphone/camera permissions.");}
}
async function acceptIncoming(row){
  const video=!!row.payload?.video;
  currentCall={id:row.call_id,peerId:row.sender_id,chatId:row.chat_id,video};
  try{
    localStream=await navigator.mediaDevices.getUserMedia({audio:true,video});
    $("localVideo").srcObject=video?localStream:null;showCall(video,video?"Incoming video call":"Incoming voice call");setCallStatus("Connecting…");
    makePeer(video);
    await peer.setRemoteDescription(new RTCSessionDescription(row.payload.sdp));
    const answer=await peer.createAnswer();await peer.setLocalDescription(answer);
    await sendSignal("answer",{sdp:answer},row.sender_id,row.call_id);
    for(const c of pendingIce.splice(0)){try{await peer.addIceCandidate(new RTCIceCandidate(c));}catch{}}
  }catch(e){await sendSignal("reject",{},row.sender_id,row.call_id);await finishCall(false);alert("Could not accept the call. Check your device permissions.");}
}
async function handleSignal(row){
  if(row.sender_id===user.id)return;
  if(row.kind==="offer"){
    if(currentCall){await sendSignal("reject",{},row.sender_id,row.call_id);return;}
    const caller=(await sb.from("usernames").select("username").eq("user_id",row.sender_id).maybeSingle()).data?.username||"A contact";
    if(confirm(caller+" is calling you. Accept?"))await acceptIncoming(row);
    else await sb.from("call_signals").insert({call_id:row.call_id,chat_id:row.chat_id,sender_id:user.id,recipient_id:row.sender_id,kind:"reject",payload:{}});
    return;
  }
  if(!currentCall||row.call_id!==currentCall.id)return;
  if(row.kind==="answer"&&peer){await peer.setRemoteDescription(new RTCSessionDescription(row.payload.sdp));for(const c of pendingIce.splice(0)){try{await peer.addIceCandidate(new RTCIceCandidate(c));}catch{}}setCallStatus("Connecting…");}
  if(row.kind==="ice"&&peer){if(peer.remoteDescription){try{await peer.addIceCandidate(new RTCIceCandidate(row.payload));}catch{}}else pendingIce.push(row.payload);}
  if(row.kind==="hangup"||row.kind==="reject"){await finishCall(false);alert(row.kind==="reject"?"Call declined.":"Call ended.");}
}
async function finishCall(notify=true){
  if(notify&&currentCall)await sendSignal("hangup",{});
  if(peer){peer.close();peer=null;}
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  $("localVideo").srcObject=null;$("remoteVideo").srcObject=null;$("remoteAudio").srcObject=null;
  $("callOverlay").classList.add("hidden");currentCall=null;pendingIce=[];
}
async function handleSession(session){
  user=session?.user||null;
  if(!user){clearChannel(chatChannel);clearChannel(messageChannel);clearChannel(signalChannel);chatChannel=messageChannel=signalChannel=null;$("newChat").classList.add("hidden");$("accountName").textContent="";$("chatList").innerHTML='<div class="updates-card"><a href="login.html">Sign in</a> to use T-Chatter.</div>';showView("chats");return;}
  const username=(user.user_metadata?.username||user.email?.split("@")[0]||"user").toLowerCase();
  $("accountName").textContent="@"+username;
  const {error:profileError}=await sb.from("profiles").upsert({id:user.id,email:null,display_name:username},{onConflict:"id"});
  if(profileError)console.warn(profileError.message);
  const {error:userError}=await sb.from("usernames").upsert({user_id:user.id,username},{onConflict:"user_id"});
  if(userError)notice("Profile setup: "+userError.message);
  await renderChats();
  clearChannel(signalChannel);signalChannel=sb.channel("call-signals-"+user.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"call_signals",filter:"recipient_id=eq."+user.id},payload=>void handleSignal(payload.new)).subscribe();
  await loadStatuses();
}
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{
  const name=tab.dataset.tab;showView(name);
  if(name==="chats")void renderChats();
  if(name==="updates")void loadStatuses();
  if(name==="calls"){$("callsList").textContent="Start voice or video calls from a contact's chat.";}
}));
$("newChat").addEventListener("click",()=>void startChat());
$("sendBtn").addEventListener("click",()=>void sendMessage());
$("messageInput").addEventListener("keydown",e=>{if(e.key==="Enter")void sendMessage();});
$("recordBtn").addEventListener("click",()=>void toggleRecording());
$("postStatus").addEventListener("click",()=>void postStatus());
$("backBtn").addEventListener("click",()=>{resetConversation();showView("chats");});
$("voiceCallBtn").addEventListener("click",()=>void startCall(false));
$("videoCallBtn").addEventListener("click",()=>void startCall(true));
$("endCallBtn").addEventListener("click",()=>void finishCall(true));
$("menuBtn").addEventListener("click",async()=>{if(!user){location.href="login.html";return;}if(confirm("Sign out of T-Chatter?")){await sb.auth.signOut();location.href="login.html";}});
$("searchInput").addEventListener("input",e=>{const q=e.target.value.toLowerCase();[...$("chatList").children].forEach(row=>row.style.display=row.textContent.toLowerCase().includes(q)?"":"none");});
sb.auth.onAuthStateChange((_event,session)=>{queueMicrotask(()=>void handleSession(session));});
