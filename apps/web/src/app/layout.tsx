import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'XEgineer — 多平台内容发布工作台',
  description: '写一次，发到所有地方',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
