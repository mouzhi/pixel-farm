// v14：把农场画面存进手机相册：主画布当前这一帧 + 底部一条小字（第几天 · 金币 · 像素放置农场）。
// 只在玩家点「拍照」时做：画布 jpeg(0.9) → 用户目录 pf-farm.jpg → saveImageToPhotosAlbum。
// 没给相册权限：弹窗问要不要去设置打开；玩家自己取消：什么都不提示。
import Taro from '@tarojs/taro'

const warn = (what: string, err: unknown) => console.warn('[farm-photo]', what, err)
const errText = (e: any) => String((e && (e.errMsg || e.message)) || e || '')
// 错误码见 saveImageToPhotosAlbum 文档：112090/112089 拒绝授权，112095 取消，112079/112080 隐私协议
const codeOf = (e: any) => Number(e && (e.errNo || e.errCode)) || 0
const isCancel = (e: any) => codeOf(e) === 112095 || /cancel/i.test(errText(e))
const isDenied = (e: any) => codeOf(e) === 112090 || codeOf(e) === 112089 || /auth deny/i.test(errText(e))
const isPrivacy = (e: any) => codeOf(e) === 112079 || codeOf(e) === 112080 || /privacy/i.test(errText(e))

function drawStrip(node: any, G: any) {
  const ctx = node.getContext('2d')
  const W = node.width
  const H = node.height
  const h = Math.max(24, Math.round(W * 0.075))
  const S = (G.__farm && G.__farm.S) || {}
  const day = Number(S.day) || 1
  const coins = Math.floor(Number(S.coins) || 0)
  const saved = ctx.getImageData(0, H - h, W, h)
  ctx.save()
  if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(42,28,18,0.82)'
  ctx.fillRect(0, H - h, W, h)
  ctx.fillStyle = '#ffd76a'
  ctx.fillRect(0, H - h, W, Math.max(1, Math.round(h / 16)))
  const fs = Math.round(h * 0.46)
  ctx.font = `bold ${fs}px sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#fff6dc'
  ctx.fillText(`第 ${day} 天 · ${coins.toLocaleString ? coins.toLocaleString('en-US') : coins} 金`, Math.round(h * 0.4), H - h / 2)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd76a'
  ctx.fillText('像素放置农场', W - Math.round(h * 0.4), H - h / 2)
  ctx.restore()
  return () => {
    try {
      ctx.putImageData(saved, 0, H - h)
    } catch {
      // 下一帧会整屏重画
    }
  }
}

function writeJpeg(b64: string) {
  return new Promise<string>((resolve, reject) => {
    const path = `${(Taro as any).env.USER_DATA_PATH}/pf-farm.jpg`
    Taro.getFileSystemManager().writeFile({ filePath: path, data: b64, encoding: 'base64', success: () => resolve(path), fail: reject })
  })
}

function captureFile(node: any, G: any): Promise<string> {
  // 同步画上小字并马上取图，取完把那一条还原（下一帧也会重画）
  const restore = drawStrip(node, G)
  let url = ''
  try {
    const toURL = node.__realToDataURL || node.toDataURL
    url = typeof toURL === 'function' ? String(toURL.call(node, 'image/jpeg', 0.9) || '') : ''
  } catch (e) {
    warn('toDataURL', e)
  }
  const m = /^data:image\/[a-z]+;base64,(.+)$/.exec(url)
  if (m) {
    restore()
    return writeJpeg(m[1])
  }
  // 兜底：画布导出成临时文件（异步，导完再还原）
  return new Promise<string>((resolve, reject) => {
    Taro.canvasToTempFilePath({
      canvas: node,
      fileType: 'jpg',
      quality: 0.9,
      success: (r: any) => { restore(); resolve(r.tempFilePath) },
      fail: (e: unknown) => { restore(); reject(e) },
    } as any)
  })
}

let busy = false
export async function saveFarmPhoto(node: any, G: any) {
  if (busy || !node) return
  busy = true
  Taro.showLoading({ title: '正在保存…', mask: true })
  let path = ''
  try {
    path = await captureFile(node, G)
  } catch (e) {
    warn('capture', e)
    Taro.hideLoading()
    Taro.showToast({ title: '拍照没成功，再试一次', icon: 'none' })
    busy = false
    return
  }
  try {
    await Taro.saveImageToPhotosAlbum({ filePath: path })
    Taro.hideLoading()
    Taro.showToast({ title: '已存到相册', icon: 'success' })
  } catch (e) {
    Taro.hideLoading()
    if (isDenied(e)) {
      warn('save denied', e)
      const r = await Taro.showModal({ title: '需要相册权限', content: '把农场照片存进相册，需要允许访问相册。去设置里打开吗？', confirmText: '去设置', cancelText: '算了' }).catch(() => null)
      if (r && r.confirm) Taro.openSetting({ fail: (err: unknown) => warn('openSetting', err) } as any)
    } else if (isPrivacy(e)) {
      warn('save privacy', e)
      Taro.showToast({ title: '需要先同意隐私协议才能存相册', icon: 'none' })
    } else if (isCancel(e)) {
      // 玩家自己取消了：不提示
    } else {
      warn('save', e)
      Taro.showToast({ title: '没存上，稍后再试', icon: 'none' })
    }
  } finally {
    busy = false
  }
}
