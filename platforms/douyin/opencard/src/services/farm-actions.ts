import { Network } from '@/network'

/** 卡面收获一次：写入服务端记录（只写，不读渲染字段） */
export async function postCardHarvest(taro: openCardTaro, cropId: string): Promise<boolean> {
  try {
    const res = await Network.request<{ success: boolean; message?: string }>(taro, {
      url: '/api/farm/card-harvest',
      method: 'POST',
      data: { cropId },
    })
    const body = res?.data as { success?: boolean; message?: string } | null
    if (!body?.success) {
      console.error('[farm] card harvest rejected', body?.message)
      return false
    }
    return true
  } catch (error) {
    console.error('[farm] card harvest failed', error)
    return false
  }
}
