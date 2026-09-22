import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Morgans Corporate Advisory Research by Michael Nguyen',description:'Independent research into three ASX equity raises led by Morgans, assessed against each company\'s stated use of funds.',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}</body></html>;}
