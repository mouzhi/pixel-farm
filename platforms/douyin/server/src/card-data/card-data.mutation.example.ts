import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

/**
 * Mutation 接口示例：仅写库/写状态，禁止返回 UI 渲染字段。
 * 复制到独立业务 module 并按需实现；不要放在 card-data.controller.ts。
 */
@Controller('api')
export class CardDataMutationExampleController {
  @Post('card-data/example-action')
  @HttpCode(200)
  async submitExampleAction(
    @Body() body: { actionId?: string },
    @Headers('x-tt-openid') openId?: string,
  ): Promise<{ success: boolean }> {
    void body;
    void openId;
    return { success: true };
  }
}
