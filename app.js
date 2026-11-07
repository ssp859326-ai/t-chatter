import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { supabaseConfig } from "./supabase-config.js";

const list = document.getElementById("chatList");
const listView = document.getElementById("listView");
const conversation = document.getElementById("conversation");
const search = document.getElementById("searchInput");
const statusEl = document.getElementById("sectionLabel");

let sb;
let user = null;
let activeChat = null;
let chatChannel = null;
let messageChannel = null;
let messageCache = [];
let backupChats = [];
let restorePromptedUserId = null;

const configured = Boolean(
  supabaseConfig?.url &&
  supabaseConfig?.publishableKey &&
  !String(supabaseConfig.publishableKey).includes("YOUR_")
);

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[char]));

const stamp = value => value
  ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  : "";

function notice(message) {
  statusEl.textContent = message;
}

function clearChannels() {
  if (chatChannel) sb?.removeChannel(chatChannel);
  if (messageChannel) sb?.removeChannel(messageChannel);
  chatChannel = null;
  messageChannel = null;
}

function showSignedOut() {
  activeChat = null;
  messageCache = [];
  backupChats = [];
  clearChannels();
  conversation.classList.add("hidden");
  listView.classList.remove("hidden");
  notice("PLEASE SIGN IN · PRIVATE CHATS");
  list.innerHTML = '<div class="updates-card"><a href="login.html">Sign in with email</a> to use T-chatter.</div>';
}

function drawMessages() {
  const box = document.getElementById("messages");
  box.replaceChildren();

  for (const message of messageCache) {
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (message.sender_id === user?.id ? "sent" : "received");
    bubble.textContent = message.body || "";

    const meta = document.createElement("span");
    meta.textContent = stamp(message.created_at);
    bubble.appendChild(meta);
    box.appendChild(bubble);
  }

  box.scrollTop = box.scrollHeight;
}

function addChatRow(chat) {
  const button = document.createElement("button");
  button.className = "chat-row";
  button.style.cssText = "border:0;background:transparent;text-align:left;width:100%;font:inherit";
  button.innerHTML =
    '<div class="avatar">' + esc((chat.name || "T").slice(0, 1).toUpperCase()) + '</div>' +
    '<div class="chat-meta"><div class="chat-top"><strong>' + esc(chat.name || "T-chatter user") +
    '</strong><span class="time">' + esc(stamp(chat.updated_at || chat.created_at)) +
    '</span></div><div class="preview">' + esc(chat.last_message || "Start a conversation") +
    '</div></div>';
  button.addEventListener("click", () => openChat(chat));
  list.appendChild(button);
}

async function renderChats() {
  if (!user) return;

  if (chatChannel) sb.removeChannel(chatChannel);
  chatChannel = null;

  const { data: memberships, error: memberError } = await sb
    .from("chat_members")
    .select("chat_id")
    .eq("user_id", user.id);

  if (memberError) {
    notice("Chats couldn't load: " + memberError.message);
    return;
  }

  const ids = (memberships || []).map(item => item.chat_id);
  list.replaceChildren();

  for (const archived of backupChats) addChatRow(archived);
  if (!ids.length && !backupChats.length) {
    list.innerHTML = '<div class="updates-card">No chats yet. Tap + to start a private conversation by email.</div>';
  } else {
    const { data: chats, error } = await sb
      .from("chats")
      .select("id,title,is_group,created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });

    if (error) {
      notice("Chats couldn't load: " + error.message);
      return;
    }

    for (const chat of chats || []) {
      const { data: members } = await sb
        .from("chat_members")
        .select("user_id")
        .eq("chat_id", chat.id);

      const other = (members || []).find(item => item.user_id !== user.id);
      let name = chat.title || "Private chat";

      if (other) {
        const { data: profile } = await sb
          .from("profiles")
          .select("display_name,email")
          .eq("id", other.user_id)
          .maybeSingle();

        name = profile?.display_name || profile?.email || name;
      }

      addChatRow({ ...chat, name });
    }
  }

  chatChannel = sb
    .channel("my-chats-" + user.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
      void renderChats();
    })
    .subscribe();
}

async function openChat(chat) {
  if (chat.isBackup) {
    activeChat = chat; messageCache = chat.messages || [];
    document.getElementById('chatName').textContent = chat.name + ' · Backup';
    document.getElementById('chatAvatar').textContent = (chat.name || 'T').slice(0,1).toUpperCase();
    listView.classList.add('hidden'); conversation.classList.remove('hidden');
    document.querySelector('.composer').classList.add('hidden');
    drawMessages(); notice('READ-ONLY BACKUP'); return;
  }
  document.querySelector('.composer').classList.remove('hidden');
  activeChat = chat;
  messageCache = [];
  document.getElementById("chatName").textContent = chat.name || "Chat";
  document.getElementById("chatAvatar").textContent = (chat.name || "T").slice(0, 1).toUpperCase();

  listView.classList.add("hidden");
  conversation.classList.remove("hidden");

  if (messageChannel) sb.removeChannel(messageChannel);
  messageChannel = null;

  const { data, error } = await sb
    .from("messages")
    .select("id,chat_id,sender_id,body,created_at")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    notice("Messages couldn't load: " + error.message);
    return;
  }

  messageCache = data || [];
  drawMessages();

  messageChannel = sb
    .channel("messages-" + chat.id)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: "chat_id=eq." + chat.id },
      payload => {
        if (!messageCache.some(item => item.id === payload.new.id)) {
          messageCache.push(payload.new);
          drawMessages();
        }
      }
    )
    .subscribe();
}

async function startChat() {
  if (!user) return;

  const email = prompt("Enter the email address of the T-chatter user:");
  if (!email) return;

  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized === user.email?.toLowerCase()) {
    alert("Enter another T-chatter user's email address.");
    return;
  }

  const { data: other, error } = await sb
    .from("profiles")
    .select("id,display_name,email")
    .eq("email", normalized)
    .maybeSingle();

  if (error || !other) {
    alert("No T-chatter user found for that email. They need to sign in once first.");
    return;
  }

  const { data: chat, error: createError } = await sb
    .from("chats")
    .insert({ created_by: user.id, title: null, is_group: false })
    .select("id")
    .single();

  if (createError || !chat) {
    alert("Couldn't create chat: " + (createError?.message || "unknown error"));
    return;
  }

  const { error: ownMemberError } = await sb
    .from("chat_members")
    .insert({ chat_id: chat.id, user_id: user.id, role: "member" });

  if (ownMemberError) {
    alert("Couldn't create chat membership: " + ownMemberError.message);
    return;
  }

  const { error: otherMemberError } = await sb
    .from("chat_members")
    .insert({ chat_id: chat.id, user_id: other.id, role: "member" });

  if (otherMemberError) {
    alert("Chat created, but the other user couldn't be added: " + otherMemberError.message);
    await renderChats();
    return;
  }

  await renderChats();
  await openChat({
    id: chat.id,
    name: other.display_name || other.email || "Private chat"
  });
}

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const body = input.value.trim();

  if (!body || !activeChat || !user) return;

  input.disabled = true;
  const { error } = await sb.from("messages").insert({
    chat_id: activeChat.id,
    sender_id: user.id,
    body
  });
  input.disabled = false;

  if (error) {
    notice("Message wasn't sent: " + error.message);
    return;
  }

  input.value = "";
  input.focus();
}

async function handleSession(session, eventName) {
  user = session?.user || null;

  if (!user) {
    showSignedOut();
    return;
  }

  const profile = {
    id: user.id,
    email: user.email?.toLowerCase() || "",
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "T-chatter user",
    avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null
  };

  const { error } = await sb.from("profiles").upsert(profile, { onConflict: "id" });
  if (error) {
    notice("Profile setup failed: " + error.message);
    return;
  }

  notice("PRIVATE CHATS · CONNECTED");
  await renderChats();
  if (restorePromptedUserId !== user.id) {
    restorePromptedUserId = user.id;
    if (confirm("Welcome to T-chatter! Restore a T-chatter backup file now? Choose OK to select a file, or Cancel to skip.")) {
      document.getElementById("backupFileInput").click();
    }
  }
}

document.getElementById("backBtn").addEventListener("click", () => {
  conversation.classList.add("hidden");
  listView.classList.remove("hidden");
  activeChat = null;
  messageCache = [];
  if (messageChannel) sb.removeChannel(messageChannel);
  messageChannel = null;
  document.querySelector(".composer").classList.remove("hidden");
});

document.getElementById("sendBtn").addEventListener("click", () => void sendMessage());
document.getElementById("messageInput").addEventListener("keydown", event => {
  if (event.key === "Enter") void sendMessage();
});

document.getElementById("searchBtn").addEventListener("click", () => {
  search.focus();
  search.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.getElementById("newChat").addEventListener("click", () => void startChat());

document.getElementById("menuBtn").addEventListener("click", async () => {
  if (user && confirm("Sign out of T-chatter?")) {
    await sb.auth.signOut();
  } else if (!user) {
    window.location.href = "login.html";
  }
});

search.addEventListener("input", () => {
  const term = search.value.trim().toLowerCase();
  [...list.children].forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
  });
});

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
    tab.classList.add("active");

    const key = tab.dataset.tab;
    if (key === "chats") {
      notice("PRIVATE CHATS · CONNECTED");
      void renderChats();
      return;
    }

    notice(key === "updates" ? "UPDATES · COMING SOON" : "CALLS · COMING SOON");
    list.innerHTML = '<div class="updates-card"><strong>' +
      (key === "updates" ? "Updates are not available yet." : "Voice/video calling is not available yet.") +
      '</strong><p>This feature is planned for a later release.</p></div>';
  });
});

if (!configured) {
  notice("SUPABASE SETUP REQUIRED");
  list.innerHTML = '<div class="updates-card">Supabase is not configured. Add the project URL and publishable key to supabase-config.js.</div>';
} else {
  sb = createClient(supabaseConfig.url, supabaseConfig.publishableKey);

  sb.auth.onAuthStateChange((_event, session) => {
    // Keep database work outside the auth callback to avoid holding the auth lock.
    queueMicrotask(() => void handleSession(session, _event));
  });

  // Supabase emits INITIAL_SESSION after the auth listener is registered.
}

async function makeTChatterBackup() {
  if (!user) return alert("Sign in first.");
  const {data: ms, error:e1} = await sb.from("chat_members").select("chat_id").eq("user_id",user.id);
  if(e1) return alert(e1.message);
  const ids=[...new Set((ms||[]).map(x=>x.chat_id))];
  if(!ids.length) return alert("No T-chatter chats to back up yet.");
  const [c,m,p]=await Promise.all([
    sb.from("chats").select("id,title,is_group,created_by,created_at").in("id",ids),
    sb.from("chat_members").select("chat_id,user_id,role,joined_at").in("chat_id",ids),
    sb.from("profiles").select("id,display_name,email,avatar_url").in("id",[...new Set((m.data||[]).map(x=>x.user_id))])
  ]);
  if(c.error||m.error||p.error) return alert((c.error||m.error||p.error).message);
  let msgs=[];
  for(let n=0;;n+=1000){const q=await sb.from("messages").select("id,chat_id,sender_id,body,created_at").in("chat_id",ids).order("created_at").range(n,n+999);if(q.error)return alert(q.error.message);msgs=msgs.concat(q.data||[]);if(!q.data||q.data.length<1000)break;}
  const backup={format:"t-chatter-backup",version:1,ownerId:user.id,exportedAt:new Date().toISOString(),chats:c.data,members:m.data,messages:msgs,profiles:p.data};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="t-chatter-backup.json";a.click();URL.revokeObjectURL(url);
  notice("BACKUP DOWNLOADED");
}
function restoreTChatterBackup(file) {
  if(!file||!user)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const b=JSON.parse(String(reader.result||""));
      if(b.format!=="t-chatter-backup"||b.version!==1||b.ownerId!==user.id||!Array.isArray(b.chats)||!Array.isArray(b.members)||!Array.isArray(b.messages)||!Array.isArray(b.profiles))throw new Error("Invalid backup or wrong T-chatter account.");
      const profiles=new Map(b.profiles.map(x=>[x.id,x]));
      backupChats=b.chats.filter(c=>b.members.some(m=>m.chat_id===c.id&&m.user_id===user.id)).map(c=>{
        const other=b.members.find(m=>m.chat_id===c.id&&m.user_id!==user.id),p=other?profiles.get(other.user_id):null;
        const chatMessages=b.messages.filter(m=>m.chat_id===c.id);return {...c,name:c.title||p?.display_name||p?.email||"T-chatter chat",isBackup:true,messages:chatMessages,last_message:chatMessages.at(-1)?.body||"Saved backup",updated_at:chatMessages.at(-1)?.created_at||c.created_at};
      });
      await renderChats();
      notice("BACKUP RESTORED · READ-ONLY ARCHIVE");
      alert("Backup restored as a read-only archive in this session. It does not overwrite live messages.");
    }catch(e){alert(e.message||"Could not restore backup.");}
  };
  reader.readAsText(file);
}
document.getElementById("backupBtn").addEventListener("click",()=>void makeTChatterBackup());
document.getElementById("restoreBtn").addEventListener("click",()=>document.getElementById("backupFileInput").click());
document.getElementById("backupFileInput").addEventListener("change",e=>{restoreTChatterBackup(e.target.files?.[0]);e.target.value="";});
