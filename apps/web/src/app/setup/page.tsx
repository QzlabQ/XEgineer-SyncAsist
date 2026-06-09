'use client'

import { useRouter } from 'next/navigation'
import { Chrome, CheckCircle, ArrowRight, Terminal, FolderOpen, RefreshCw } from 'lucide-react'

const STEPS = [
  {
    icon: <Terminal size={20} className="text-blue-500" />,
    title: '构建扩展',
    code: 'yarn workspace @xegineer/extension build',
    desc: '在项目根目录运行，生成 packages/extension/dist/ 目录',
  },
  {
    icon: <Chrome size={20} className="text-blue-500" />,
    title: '打开扩展管理',
    desc: '在 Chrome 地址栏输入 chrome://extensions/ 并回车',
    extra: '开启右上角「开发者模式」开关',
  },
  {
    icon: <FolderOpen size={20} className="text-blue-500" />,
    title: '加载扩展',
    desc: '点击「加载已解压的扩展程序」，选择项目目录下的',
    code: 'packages/extension/dist/',
  },
  {
    icon: <RefreshCw size={20} className="text-blue-500" />,
    title: '刷新页面',
    desc: '回到 XEgineer 页面刷新，扩展即可生效',
  },
]

export default function SetupPage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--accent)] rounded-2xl mb-4 shadow-lg">
            <Chrome size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--fg-primary)] mb-2">安装浏览器扩展</h1>
          <p className="text-[var(--fg-tertiary)] text-sm">XEgineer 需要 Chrome 扩展来调用各平台 API 完成发布</p>
        </div>

        {/* Steps */}
        <div className="bg-[var(--bg-surface)] rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 space-y-5">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex-shrink-0 flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                  {step.icon}
                </div>
                {i < STEPS.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-2" />}
              </div>
              <div className="pb-5 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-[var(--accent)] bg-blue-50 px-2 py-0.5 rounded-full">步骤 {i + 1}</span>
                  <span className="text-sm font-semibold text-[var(--fg-primary)]">{step.title}</span>
                </div>
                <p className="text-sm text-[var(--fg-tertiary)]">{step.desc}</p>
                {step.extra && <p className="text-sm text-[var(--fg-tertiary)] mt-0.5">{step.extra}</p>}
                {step.code && (
                  <code className="mt-2 block text-xs bg-gray-900 text-green-400 px-3 py-2 rounded-md font-mono break-all">
                    {step.code}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex gap-2">
            <CheckCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700">
              <p className="font-medium mb-1">为什么需要扩展？</p>
              <p>各平台的发布 API 需要浏览器 Cookie 认证。扩展运行在你的浏览器中，直接复用你已登录的会话，无需额外授权，账号凭证不经过任何服务器。</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/articles')}
            className="flex-1 py-3 text-sm text-[var(--fg-secondary)] bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-xl hover:bg-[var(--bg-app)] transition-colors"
          >
            稍后再说
          </button>
          <button
            onClick={() => router.push('/settings')}
            className="flex-1 py-3 text-sm text-white bg-[var(--accent)] rounded-xl hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2"
          >
            安装完成，去检测
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
