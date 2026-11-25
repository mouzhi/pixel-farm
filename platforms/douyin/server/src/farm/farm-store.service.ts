import { Injectable } from '@nestjs/common';

export interface CardProgress {
  coins: number;
  harvests: number;
  /** 已经收进落地页农场的金币 */
  claimed: number;
  lastHarvestAt: number;
}

const MAX_COINS = 10_000_000;

/**
 * 按用户记录卡面收获。当前为服务进程内存存储：服务重启后清零（未开数据库）。
 */
@Injectable()
export class FarmStoreService {
  private readonly progress = new Map<string, CardProgress>();

  static userKey(openId?: string): string {
    const id = typeof openId === 'string' ? openId.trim() : '';
    return id ? `u:${id}` : 'guest';
  }

  get(openId?: string): CardProgress {
    return (
      this.progress.get(FarmStoreService.userKey(openId)) ?? {
        coins: 0,
        harvests: 0,
        claimed: 0,
        lastHarvestAt: 0,
      }
    );
  }

  addHarvest(openId: string | undefined, coins: number): void {
    const current = this.get(openId);
    this.progress.set(FarmStoreService.userKey(openId), {
      ...current,
      coins: Math.min(MAX_COINS, current.coins + coins),
      harvests: current.harvests + 1,
      lastHarvestAt: Date.now(),
    });
  }

  claim(openId?: string): number {
    const current = this.get(openId);
    const amount = Math.max(0, current.coins - current.claimed);
    if (amount > 0) {
      this.progress.set(FarmStoreService.userKey(openId), { ...current, claimed: current.coins });
    }
    return amount;
  }
}
