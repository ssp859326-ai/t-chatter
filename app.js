import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseConfig } from "./supabase-config.js";

const list=document.getElementById("chatList"),listView=document.getElementById("listView"),conversation=document.getElementById("conversation"),search=document.getElementById("searchInput"),statusEl=document.getElementById("sectionLabel");
let sb,user,activeChat,chatChannel,messageChannel;
const configured=!!supabaseConfig?.url&&!!supabaseConfig?.publishableKey&&!String(supabaseConfig.publishableKey).includes("YOUR_");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const stamp=d=>d?new Date(d).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"";
function notice(t){statusEl.textContent=t;}
function row(c){const b=document.createElement("button");b.className="chat-row";b.style.cssText="border:0;background:transparent;text-align:left;width:100%;font:inherit";b.innerHTML='<div class="avatar">'+esc((c.name||"T").slice(0,1).toUpperCase())+'</div><div class="chat-meta"><div class="chat-top"><strong>'+esc(c.name||"T-chatter user")+'</strong><span class="time">'+esc(stamp(c.updated_at))+'</span></div><div class="preview">'+esc(c.last_message||"Start a conversation")+'</div></div>';b.onclick=()=>openChat(c);list.appendChild(b);}
async function renderChats(){
 if(!user)return;
 if(chatChannel){sb.removeChannel(chatChannel);chatChannel=null;}
 const {data:members,error}=await sb.from("chat_members").select("chat_id").eq("user_id",user.id);
 if(error){notice("Chats load failed: "+error.message);return;}
 const ids=(members||[]).map(x=>x.chat_id);
 list.innerHTML="";
 if(!ids.length){list.innerHTML='<div class="updates-card">No chats yet. Tap + to start a private conversation by email.</div>';return;}
 const {data:chats,error:e}=await sb.from("chats").select("id,title,is_group,created_at").in("id",ids).order("created_at",{ascending:false});
 if(e){notice("Chats load failed: "+e.message);return;}
 for(const c of chats||[]){const {data:ms}=await sb.from("chat_members").select("user_id").eq("chat_id",c.id);const other=(ms||[]).find(x=>x.user_id!==user.id);let name=c.title||"Private chat";if(other){const {data:p}=await sb.from("profiles").select("display_name,email").eq("id",other.user_id).maybeSingle();name=p?.display_name||p?.email||name;}row({...c,name});}
 chatChannel=sb.channel("my-chats-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"messages"},()=>renderChats()).subscribe();
}
async function openChat(c){
 activeChat=c;document.getElementById("chatName").textContent=c.name||"Chat";document.getElementById("chatAvatar").textContent=(c.name||"T").slice(0,1).toUpperCase();document.querySelector(".person small").textContent="Private chat";listView.classList.add("hidden");conversation.classList.remove("hidden");
 const messages=document.getElementById("messages");messages.innerHTML="";
 if(messageChannel){sb.removeChannel(messageChannel);messageChannel=null;}
 const {data,error}=await sb.from("messages").select("id,chat_id,sender_id,body,created_at").eq("chat_id",c.id).order("created_at",{ascending:true}).limit(300);
 if(error){notice("Messages load failed: "+error.message);return;}
 drawMessages(data||[]);
 messageChannel=sb.channel("messages-"+c.id).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"chat_id=eq."+c.id},payload=>drawMessages([...(data||[]),payload.new])).subscribe();
}
function drawMessages(items){const box=document.getElementById("messages");box.innerHTML="";for(const m of items){const b=document.createElement("div");b.className="bubble "+(m.sender_id===user.id?"sent":"received");b.textContent=m.body||"";const meta=document.createElement("span");meta.textContent=stamp(m.created_at);b.appendChild(meta);box.appendChild(b);}box.scrollTop=box.scrollHeight;}
async function startChat(){
 if(!user)return;const email=prompt("Enter the email address of the T-chatter user:");if(!email)return;
 const normalized=email.trim().toLowerCase();if(normalized===user.email?.toLowerCase()){alert("You can't start a chat with yourself.");return;}
 const {data:other,error}=await sb.from("profiles").select("id,display_name,email").ilike("email",normalized).maybeSingle();
 if(error||!other){alert("No T-chatter user found for that email. They need to sign in once first.");return;}
 const {data:chat,error:ce}=await sb.from("chats").insert({created_by:user.id,title:null,is_group:false}).select("id").single();
 if(ce||!chat){alert("Couldn't create chat: "+(ce?.message||"unknown error"));return;}
 const {error:me}=await sb.from("chat_members").insert([{chat_id:chat.id,user_id:user.id,role:"member"},{chat_id:chat.id,user_id:other.id,role:"member"}]);
 if(me){alert("Couldn't add chat members: "+me.message);return;}
 await renderChats();openChat({id:chat.id,name:other.display_name||other.email||"Private chat"});
}
async function sendMessage(){const input=document.getElementById("messageInput"),body=input.value.trim();if(!body||!activeChat||!user)return;input.value="";const {error}=await sb.from("messages").insert({chat_id:activeChat.id,sender_id:user.id,body});if(error){notice("Message wasn't sent: "+error.message);input.value=body;}}
document.getElementById("backBtn").onclick=()=>{conversation.classList.add("hidden");listView.classList.remove("hidden");activeChat=null;if(messageChannel){sb.removeChannel(messageChannel);messageChannel=null;}};
document.getElementById("sendBtn").onclick=sendMessage;document.getElementById("messageInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendMessage();});
document.getElementById("searchBtn").onclick=()=>{search.focus();search.scrollIntoView({behavior:"smooth",block:"center"});};document.getElementById("newChat").onclick=startChat;
document.getElementById("menuBtn").onclick=async()=>{if(user&&confirm("Sign out of T-chatter?"))await sb.auth.signOut();};
search.addEventListener("input",()=>{const term=search.value.trim().toLowerCase();[...list.children].forEach(r=>r.style.display=r.textContent.toLowerCase().includes(term)?"":"none");});
document.querySelectorAll(".tab").forEach(tab=>tab.addEventListener("click",()=>{document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));tab.classList.add("active");const key=tab.dataset.tab;statusEl.textContent=key==="chats"?"MESSAGES · PRIVATE":key==="updates"?"UPDATES · COMING SOON":"CALLS · COMING SOON";if(key!=="chats")list.innerHTML='<div class="updates-card"><strong>'+ (key==="updates"?"Updates are not available yet":"Voice/video calling is not available yet")+'</strong><p>This feature will appear after its service is implemented.</p></div>';else renderChats();}));
if(!configured){notice("Supabase setup required · add supabase-config.js.");list.innerHTML='<div class="updates-card">Supabase is not configured yet. Add the project URL and publishable key to activate sign-in and messaging.</div>';}
else{
 sb=createClient(supabaseConfig.url,supabaseConfig.publishableKey);
 sb.auth.onAuthStateChange(async(_event,session)=>{user=session?.user||null;if(!user){notice("Please sign in with Google to use private chats.");list.innerHTML='<div class="updates-card"><a href="login.html">Sign in with Google</a> to load private conversations.</div>';return;}
 const {error}=await sb.from("profiles").upsert({id:user.id,email:user.email?.toLowerCase()||"",display_name:user.user_metadata?.full_name||user.user_metadata?.name||user.email||"T-chatter user",avatar_url:user.user_metadata?.avatar_url||user.user_metadata?.picture||null},{onConflict:"id"});
 if(error){notice("Profile setup failed: "+error.message);return;}notice("PRIVATE CHATS · CONNECTED");await renderChats();});
 const {data}=await sb.auth.getSession();if(data.session){user=data.session.user;notice("PRIVATE CHATS · CONNECTED");await renderChats();}
}
