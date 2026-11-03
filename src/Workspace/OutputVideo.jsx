import {useEffect,useRef,useState} from 'react';
// Keep the existing OUTPUT player; defer offscreen media until it approaches
// the viewport. Once attached, never detach a playing video on scroll.
export default function OutputVideo({src,...props}){
 const ref=useRef(null),[visible,setVisible]=useState(()=>!globalThis.IntersectionObserver);
 useEffect(()=>{
  if(!globalThis.IntersectionObserver)return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'200px'});
  observer.observe(ref.current);return()=>observer.disconnect();
 },[]);
 return <video ref={ref} {...props} src={visible?src:undefined} preload={visible?'metadata':'none'}/>;
}
