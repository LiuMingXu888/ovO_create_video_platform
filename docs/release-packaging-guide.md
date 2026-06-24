# ovO 打包与 Gitee 发布流程

本文档记录从 `ui-shell` worktree 打包 `release/windows`，以及正式发布到 Gitee Release 的流程。

当前项目路径：

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
```

## 一、先确认你在哪个分支

进入目录后先看状态：

```bash
git status --short --branch
git remote -v
```

你平时开发通常在：

```text
feature/ui-shell
```

正式执行 `npm run release:patch` 发布时，脚本要求在：

```text
main
```

并且要求工作区干净，也就是 `git status --short` 没有任何输出。

## 二、只想本地打包 release 目录

如果只是生成 Windows 安装包，不推送 Gitee，不创建 Release，可以执行：

```bash
npm install
npm run dist:win
```

打包产物会生成在：

```text
release/windows/
```

常见产物：

```text
release/windows/ovO-x.y.z-x64-setup.exe
release/windows/ovO-x.y.z-x64-portable.exe
release/windows/latest.yml
release/windows/win-unpacked/
```

普通用户优先发：

```text
release/windows/ovO-x.y.z-x64-setup.exe
```

免安装测试可以发：

```text
release/windows/ovO-x.y.z-x64-portable.exe
```

如果只生成安装包：

```bash
npm run dist:win:installer
```

如果只生成免安装版：

```bash
npm run dist:win:portable
```

## 三、修改版本号

版本号在 `package.json` 里：

```json
"version": "0.1.3"
```

### 方式 A：手动改版本后本地打包

适合你只想本地打包，不正式发 Gitee Release。

```bash
npm version 0.1.4 --no-git-tag-version
npm run dist:win
```

这会同时更新：

```text
package.json
package-lock.json
```

然后生成对应版本的安装包，例如：

```text
release/windows/ovO-0.1.4-x64-setup.exe
```

### 方式 B：正式发布时自动加 patch 版本

项目已有脚本：

```bash
npm run release:patch
```

它会把 patch 版本自动加 1，例如：

```text
0.1.3 -> 0.1.4
```

并且会自动提交版本号、打 tag、推送 Gitee、创建 Gitee Release。

## 四、正式发布到 Gitee

正式发布的目的：让 Windows 已安装版本可以从应用里的更新按钮检查到新版本。

发布脚本是：

```bash
npm run release:patch
```

脚本会做这些事：

1. 检查工作区必须干净。
2. 检查当前分支必须是 `main`。
3. 检查 `gitee` remote 是否正确。
4. 检查本地 `main` 没有落后于 `gitee/main`。
5. 自动把 patch 版本加 1。
6. 执行 `npm run dist:win:installer`。
7. 校验 `release/windows/latest.yml` 和安装包版本一致。
8. 提交 `package.json`、`package-lock.json`。
9. 创建 tag，例如 `v0.1.4`。
10. 推送到 Gitee：`HEAD:main` 和版本 tag。
11. 创建 Gitee Release。
12. 上传安装包和 `latest.yml`。

脚本使用的 Gitee 仓库：

```text
git@gitee.com:siberian-aries/ov-o_create_video_platform.git
```

Gitee Release 会上传：

```text
release/windows/ovO-x.y.z-x64-setup.exe
release/windows/latest.yml
```

应用内更新依赖这两个附件，所以正式发布时不能只上传 exe。

## 五、正式发布前检查清单

先确认当前目录：

```bash
pwd
```

应该是：

```text
/Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
```

确认 remote：

```bash
git remote -v
```

应该包含：

```text
gitee  git@gitee.com:siberian-aries/ov-o_create_video_platform.git (fetch)
gitee  git@gitee.com:siberian-aries/ov-o_create_video_platform.git (push)
```

确认发布脚本预演：

```bash
npm run release:patch -- --dry-run
```

如果当前不是 `main` 或工作区不干净，dry-run 会提示。真实发布前必须解决这些提示。

确认 Gitee token：

```bash
echo $GITEE_ACCESS_TOKEN
```

如果没有输出，需要先设置：

```bash
export GITEE_ACCESS_TOKEN="你的 Gitee 私人令牌"
```

然后执行正式发布：

```bash
npm run release:patch
```

成功时终端会看到类似：

```text
released v0.1.4 to gitee
```

## 六、feature 分支和 main 的关系

当前 `ui-shell` worktree 常用开发分支是 `feature/ui-shell`。这个分支可以推到 Gitee：

```bash
git push gitee feature/ui-shell
```

但这只是同步开发分支，不等于正式发布。

正式发布脚本要求在 `main` 上执行，并且会推：

```text
gitee main
gitee v版本号
```

所以发布前通常流程是：

1. 在 `feature/ui-shell` 完成开发和测试。
2. 提交所有改动。
3. 推送开发分支到 Gitee。
4. 把要发布的代码合并到 `main`。
5. 切到 `main` 后执行 `npm run release:patch -- --dry-run`。
6. dry-run 没问题后执行 `npm run release:patch`。

## 七、常见报错

### 发布前工作区必须干净

说明还有未提交或未处理的文件。

```bash
git status --short
```

把需要发布的改动提交，不需要发布的改动先移走或处理掉。

### 发布必须在 main 分支执行

说明你还在 `feature/ui-shell`。

先把代码合并到 `main`，再在 `main` 执行发布脚本。

### 缺少 GITEE_ACCESS_TOKEN

说明没有设置 Gitee 私人令牌。

```bash
export GITEE_ACCESS_TOKEN="你的 Gitee 私人令牌"
```

### 本地 main 落后于 gitee/main

说明 Gitee 上的 `main` 比你本地新。先同步 Gitee 的 `main`，解决冲突后再发布。

### Gitee tag 或 Release 已存在

说明这个版本号已经发布过。不要重复发布同一个版本。检查 Gitee Release 和本地 tag 后，决定是删除错误 Release，还是继续发布下一个版本。

### latest.yml 不匹配

说明 `release/windows/latest.yml` 里的版本或安装包名不是本次版本。重新执行：

```bash
npm run dist:win:installer
```

然后再发布。

## 八、最常用命令速查

进入目录：

```bash
cd /Users/mac/Documents/codeList/ovO_create_video_platform/.worktrees/ui-shell
```

看状态：

```bash
git status --short --branch
```

本地完整打包：

```bash
npm run dist:win
```

只打安装包：

```bash
npm run dist:win:installer
```

手动改版本：

```bash
npm version 0.1.4 --no-git-tag-version
```

正式发布预演：

```bash
npm run release:patch -- --dry-run
```

正式发布到 Gitee：

```bash
npm run release:patch
```

推开发分支到 Gitee：

```bash
git push gitee feature/ui-shell
```
