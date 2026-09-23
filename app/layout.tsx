import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'ASX Capital Raising Precedents by Michael Nguyen',description:'Equity, debt, hybrid and convertible precedents for ASX 200 companies since 2021.',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en-AU"><body>{children}</body></html>;}
