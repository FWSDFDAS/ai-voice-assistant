export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-12 shadow-2xl border border-white/20 animate-fadeIn">
          {/* 主标题 */}
          <h1 className="text-6xl md:text-7xl font-bold text-center mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-gradient">
            Hello World
          </h1>

          {/* 副标题 */}
          <p className="text-xl text-gray-300 text-center mb-8 leading-relaxed">
            欢迎来到基于 Vite + React + TypeScript 的现代化前端项目
          </p>

          {/* 技术栈卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-blue-400/50 transition-all duration-300 hover:scale-105">
              <div className="text-3xl mb-2">⚡</div>
              <h3 className="text-white font-semibold text-lg">Vite</h3>
              <p className="text-gray-400 text-sm">极速构建工具</p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-cyan-400/50 transition-all duration-300 hover:scale-105">
              <div className="text-3xl mb-2">⚛️</div>
              <h3 className="text-white font-semibold text-lg">React 18</h3>
              <p className="text-gray-400 text-sm">UI 框架</p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 border border-white/10 hover:border-blue-400/50 transition-all duration-300 hover:scale-105">
              <div className="text-3xl mb-2">📘</div>
              <h3 className="text-white font-semibold text-lg">TypeScript</h3>
              <p className="text-gray-400 text-sm">类型安全</p>
            </div>
          </div>

          {/* 项目结构信息 */}
          <div className="bg-black/20 rounded-xl p-6 border border-white/5">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <span>📁</span> 项目目录结构
            </h3>
            <code className="text-sm text-gray-300 block font-mono leading-relaxed">
              src/<br />
              &nbsp;&nbsp;├── pages/&nbsp;&nbsp;&nbsp;&nbsp;# 页面组件<br />
              &nbsp;&nbsp;├── components/# 可复用组件<br />
              &nbsp;&nbsp;├── hooks/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# 自定义 Hooks<br />
              &nbsp;&nbsp;└── utils/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;# 工具函数
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
