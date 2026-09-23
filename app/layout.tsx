import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Morgans Corporate Advisory Research by Michael Nguyen',description:'An ASX equity-raising precedent register and working model, with three researched Morgans deal studies.',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}</body></html>;}
