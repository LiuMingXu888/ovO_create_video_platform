# React DevTools 使用说明(开发调试)

仅开发模式生效,生产打包不含。

## 下次怎么用
1. 终端起独立 DevTools 窗口: `npm run devtools`(或 `npx react-devtools`),会弹出一个等待连接的窗口。
2. 另开终端启动 ovO 开发模式: `npm run dev:electron`。
3. 渲染进程在 dev 下自动连 localhost:8097,DevTools 窗口出现组件树即成功。

## 原理
`src/main.tsx` 在 `import.meta.env.DEV` 为真时注入连接脚本指向 8097。
`npm run build` 时该分支为 false,被 tree-shake,生产产物里 grep 不到 8097。

## 实际连接方式
本项目采用: script 注入(在 `ReactDOM.createRoot` 之前向 `document.head` 插入 `<script src="http://localhost:8097">`),react-devtools 版本 7.0.1。
