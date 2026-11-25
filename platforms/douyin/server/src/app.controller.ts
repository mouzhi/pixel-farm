import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import type { CreateUserDto, HelloResponse, UpdateUserDto, UserInfo, UserResponse, UsersResponse } from './app.service';
import { AppService } from './app.service';

/**
 * 抖音卡片数据响应体
 * 使用场景：用于抖音卡片数据接口的返回格式
 */
interface DyCardDataResponse {
  success: boolean;
  data: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '获取数据失败';
}

/**
 * 自定义 Feed 卡的正式取数接口必须在独立业务模块中实现 `ALL /api/dy_card/data`，
 * 供 B 端预览、C 端扫码预览和线上环境统一获取 Feed 卡数据。
 * 接口入参建议与参考实现保持一致：优先读取 `x-tt-openid`，按需读取 `x-dy-delegatetoken`。
 * 模板不会直接内置正式路由；vibecoding 时应先声明 JSON 协议，
 * 再按协议分别实现小程序前端和服务端。
 */
@Controller('api')
export class AppController {
  constructor(private readonly appService: AppService) { }

  /**
   * 示例接口
   * @returns 包含问候消息的对象
   */
  @Get('hello')
  getHello(): Promise<HelloResponse> {
    return this.appService.getHello();
  }

  /**
   * 综合示例接口：演示 Query、用户 Header 与 OpenAPI 委托 Token 的串联方式。
   */
  @Get('endpoint-path')
  async methodName(
    @Query('param') param: string,
    @Headers('x-tt-openid') openid?: string,
    @Headers('x-tt-unionid') unionid?: string,
    @Headers('x-tt-anonymous-openid') anonymousOpenid?: string,
    @Headers('x-dy-delegatetoken') delegateToken?: string,
    @Headers('x-tt-logid') logid?: string,
  ): Promise<{ result: string }> {
    const userInfo: UserInfo = { openid, unionid, anonymousOpenid };
    return this.appService.methodName(param, userInfo, delegateToken, logid);
  }

  /**
   * 需要用户登录的接口示例。
   */
  @Get('user-info')
  async getUserInfo(@Headers('x-tt-openid') openid?: string): Promise<UserResponse> {
    if (!openid) {
      throw new BadRequestException('用户未登录');
    }
    return this.appService.getUserInfo(openid);
  }


  /**
   * 自定义 GET 接口示例。
   */
  @Get('your-endpoint')
  async yourMethod(@Query('param') param: string): Promise<{ result: string }> {
    return this.appService.yourMethod(param);
  }

  /**
   * 自定义 POST 接口示例。
   */
  @Post('your-endpoint')
  async createSomething(@Body() dto: CreateUserDto): Promise<{ result: string }> {
    return this.appService.createSomething(dto);
  }

  /**
   * 自定义 PUT 接口示例。
   */
  @Put('your-endpoint/:id')
  async updateSomething(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<{ result: string }> {
    return this.appService.updateSomething(id, dto);
  }

  /**
   * 用户列表接口示例。
   */
  @Get('users')
  async getUsers(): Promise<UsersResponse> {
    return this.appService.getUsers();
  }
}

/**
 * 健康检查控制器
 * 用于服务验活，不使用全局前缀
 */
@Controller('v1')
export class HealthController {
  /**
   * 平台通过该接口状态（是否返回 Status Code 200）判断服务存活性。
   */
  @Get('ping')
  ping(): string {
    return 'pong';
  }
}
