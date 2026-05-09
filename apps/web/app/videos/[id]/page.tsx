"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
const SB = "https://lrolatbudvianeazliax.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb2xhdGJ1ZHZpYW5lYXpsaWF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTA1NjYsImV4cCI6MjA5MzMyNjU2Nn0.ETlgrZ9qi9hAxXKrysPbmNpJTiaCE7-BXo5tfes5IV4";
interface Video { id: string; youtube_id: string; title: string; points_value: number; }
export default function VideoPage(): JSX.Element {
  const params = useParams(); const router = useRouter(); const id = params.id as string;
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [f1, setF1] = useState<string>(""); const [f2, setF2] = useState<string>(""); const [f3, setF3] = useState<string>("");
  const [result, setResult] = useState<{success:boolean;points_awarded?:number;message?:string}|null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [userId, setUserId] = useState<string>("");
  useEffect(()=>{fetch(`${SB}/rest/v1/videos?id=eq.${id}&select=*`,{headers:{apikey:KEY,Authorization:`Bearer ${KEY}`}}).then(r=>r.json()).then((d:Video[])=>{setVideo(d[0]||null);setLoading(false);}).catch(()=>setLoading(false));},[id]);
  useEffect(()=>{if(typeof window==="undefined")return;try{const keys=Object.keys(localStorage).filter((k:string)=>k.includes("auth-token"));if(keys.length>0){const key=keys[0] as string;const item=localStorage.getItem(key);const p=JSON.parse(item||"{}");if(p?.user?.id)setUserId(p.user.id);}}catch(e){}},[]);
  const handleSubmit=async()=>{
    setSubmitting(true);
    let token="";
    try{
      const allCookies=document.cookie.split(";");
      const parts:string[]=[];
      let i=0;
      while(true){
        const part=allCookies.find(c=>c.trim().startsWith(`sb-lrolatbudvianeazliax-auth-token.${i}=`));
        if(!part)break;
        parts.push(part.trim().split("=").slice(1).join("="));
        i++;
      }
      const combined=parts.join("").replace("base64-","");
      const decoded=JSON.parse(atob(combined));
      token=decoded?.access_token||"";
    }catch(e){console.error("token error:",e)}
    const res=await fetch("/api/verify-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({video_id:id,code:f1+"-"+f2+"-"+f3,token})});
    const data=await res.json();
    setResult(data);
    if(data.success){
      router.push(`/videos/${id}/quiz`);
    }
    setSubmitting(false);
  };

  if(loading)return <div style={{background:"#080808",minHeight:"100vh",color:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center"}}>Chargement...</div>;
  if(!video)return <div style={{background:"#080808",minHeight:"100vh",color:"#F5F0E8",display:"flex",alignItems:"center",justifyContent:"center"}}>Video introuvable</div>;
  return(<main style={{background:"#080808",minHeight:"100vh",color:"#F5F0E8",fontFamily:"DM Sans,sans-serif"}}><nav style={{padding:"1rem 2rem",borderBottom:"1px solid rgba(255,255,255,.08)",display:"flex",justifyContent:"space-between"}}><span style={{fontFamily:"Bebas Neue,sans-serif",fontSize:"1.5rem",cursor:"pointer"}} onClick={()=>router.push("/dashboard")}>LEVE</span><span style={{opacity:.5,cursor:"pointer"}} onClick={()=>router.push("/videos")}>Retour</span></nav><div style={{maxWidth:"900px",margin:"0 auto",padding:"2rem"}}><h1 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:"2.5rem"}}>{video.title}</h1><span style={{background:"#D4A017",color:"#080808",padding:".25rem .75rem",fontSize:".75rem"}}>{video.points_value} pts</span><div style={{margin:"2rem 0",aspectRatio:"16/9"}}><iframe src={`https://www.youtube.com/embed/${video.youtube_id}`} allowFullScreen style={{width:"100%",height:"100%",border:"none"}}/></div><div style={{background:"#111",padding:"2rem"}}><h2 style={{fontFamily:"Bebas Neue,sans-serif",fontSize:"1.8rem",color:"#C0392B",marginBottom:"1.5rem"}}>SOUMETS TON CODE</h2><div style={{display:"flex",gap:"1rem",alignItems:"center"}}><input maxLength={4} value={f1} onChange={(e)=>setF1(e.target.value.toUpperCase())} placeholder="XXXX" style={{width:"80px",padding:".75rem",background:"#222",border:"1px solid #333",color:"#F5F0E8",textAlign:"center",fontSize:"1.1rem"}}/><span>-</span><input maxLength={4} value={f2} onChange={(e)=>setF2(e.target.value.toUpperCase())} placeholder="XXXX" style={{width:"80px",padding:".75rem",background:"#222",border:"1px solid #333",color:"#F5F0E8",textAlign:"center",fontSize:"1.1rem"}}/><span>-</span><input maxLength={4} value={f3} onChange={(e)=>setF3(e.target.value.toUpperCase())} placeholder="XXXX" style={{width:"80px",padding:".75rem",background:"#222",border:"1px solid #333",color:"#F5F0E8",textAlign:"center",fontSize:"1.1rem"}}/><button onClick={handleSubmit} disabled={submitting||f1.length<4||f2.length<4||f3.length<4} style={{background:"#C0392B",color:"#fff",border:"none",padding:".75rem 2rem",cursor:"pointer"}}>VALIDER</button></div>{result&&<div style={{marginTop:"1.5rem",padding:"1rem",background:result.success?"rgba(46,204,113,.1)":"rgba(192,57,43,.1)"}}>{result.success?`✅ +${result.points_awarded} points`:`❌ ${result.message||"Code incorrect"}`}</div>}</div></div></main>);
}