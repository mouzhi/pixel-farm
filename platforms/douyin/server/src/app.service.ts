import { Injectable } from '@nestjs/common';
import { getAllUsers, getConnection, getRandomGreeting, getUserByUid, updateUser, type UserRow } from './lib/db';

export interface UserInfo {
  openid?: string;
  unionid?: string;
  anonymousOpenid?: string;
}

/** 创建用户时的请求体 DTO。 */
export interface CreateUserDto {
  name: string;
  birthday?: string;
}

/** 更新用户时的请求体 DTO。 */
export interface UpdateUserDto {
  name?: string;
  birthday?: string;
}

/** 接口响应类型。 */
export interface HelloResponse {
  message: string;
}

export interface UserResponse {
  user: UserRow | null;
}

export interface UsersResponse {
  users: UserRow[];
}

@Injectable()
export class AppService {
  /**
   * 示例接口方法
   * 使用场景：返回问候消息
   * @returns 包含问候消息的对象
   */
  async getHello(): Promise<HelloResponse> {
    return {
      message: 'Hello World!',
    };
  }

  /**
   * 业务方法
   * 使用场景：处理业务逻辑
   * @param param 参数
   * @param userInfo 用户信息
   * @param delegateToken 委托令牌
   * @param logid 请求日志 ID
   * @returns 包含消息的对象
   */
  async businessMethod(
    param: string,
    userInfo?: UserInfo,
    delegateToken?: string,
    logid?: string,
  ): Promise<{ message: string }> {
    console.log('[DEBUG] AppService.businessMethod called with param:', param, 'userInfo:', userInfo, 'logid:', logid);

    const result = await getRandomGreeting();

    return { message: result || '默认消息' };
  }

  /**
   * 示例方法
   * 使用场景：作为业务逻辑的入口点
   * @param param 参数
   * @param userInfo 用户信息
   * @param delegateToken 委托令牌
   * @param logid 请求日志 ID
   * @returns 包含结果的对象
   */
  async methodName(
    param: string,
    userInfo?: UserInfo,
    delegateToken?: string,
    logid?: string,
  ): Promise<{ result: string }> {
    const { message } = await this.businessMethod(param, userInfo, delegateToken, logid);
    return { result: message };
  }

  /**
   * 获取用户信息
   * 使用场景：通过用户 openid 获取用户信息
   * @param openid 用户 openid
   * @returns 包含用户信息的对象
   */
  async getUserInfo(openid: string): Promise<UserResponse> {
    const user = await getUserByUid(openid);
    return { user };
  }

  /**
   * 抖音卡片数据示例
   * 使用场景：演示卡片接口中如何读取用户 Header、优先调用 OpenAPI，并返回可 JSON.stringify 的 DataSchema 数据。
   * 该方法仅用于模板示例，不等同于 feed 型 opencard 的正式 `dy_card/data` 实现。
   * 遇到正式 Feed 卡需求时，先声明 JSON 协议，
   * 再按协议分别实现前端请求/渲染逻辑与服务端生成/序列化逻辑。
   * @param openId 用户 openid
   * @param delegateToken 开发环境下的委托令牌
   * @param logid 请求日志 ID
   * @returns 卡片数据
   */
  async getExampleDyCardData(openId: string, delegateToken?: string, logid?: string): Promise<Record<string, unknown>> {
    void delegateToken;
    void logid;
    return {
      openId,
      title: '今日推荐',
      updatedAt: new Date().toISOString(),
    };
  }


  /**
   * 自定义方法
   * 使用场景：示例方法，用于演示如何实现自定义业务逻辑
   * @param param 参数
   * @returns 包含结果的对象
   */
  async yourMethod(param: string): Promise<{ result: string }> {
    const pool = await getConnection();
    void pool;
    void param;
    return { result: 'success' };
  }

  /**
   * 创建方法
   * 使用场景：示例方法，用于演示如何创建数据
   * @param data 创建数据
   * @returns 包含结果的对象
   */
  async createSomething(data: CreateUserDto): Promise<{ result: string }> {
    void data;
    return { result: 'created' };
  }

  /**
   * 更新方法
   * 使用场景：示例方法，用于演示如何更新数据
   * @param id 数据 ID
   * @param data 更新数据
   * @returns 包含结果的对象
   */
  async updateSomething(id: string, data: UpdateUserDto): Promise<{ result: string }> {
    void id;
    void data;
    return { result: 'updated' };
  }

  /**
   * 获取用户列表
   * 使用场景：获取所有用户的列表
   * @returns 包含用户列表的对象
   */
  async getUsers(): Promise<UsersResponse> {
    const users = await getAllUsers();
    return { users };
  }

  /**
   * 处理用户请求
   * 使用场景：处理用户的请求
   * @param userId 用户 ID
   * @param requestData 请求数据
   * @param userInfo 用户信息
   * @param delegateToken 委托令牌
   * @param logid 请求日志 ID
   * @returns 包含处理结果的对象
   */
  async processUserRequest(
    userId: string,
    requestData: unknown,
    userInfo?: UserInfo,
    delegateToken?: string,
    logid?: string,
  ): Promise<{
    result:
    | { error: string }
    | {
      userId: string;
      name: string;
      request: unknown;
      processedAt: string;
    };
  }> {
    console.log('[DEBUG] 处理用户请求:', userId, 'userInfo:', userInfo, 'logid:', logid);

    const user = await getUserByUid(userId);
    if (!user) {
      return { result: { error: '用户不存在' } };
    }

    const processedData: {
      userId: string;
      name: string;
      request: unknown;
      processedAt: string;
    } = {
      userId: user.uid,
      name: user.name,
      request: requestData,
      processedAt: new Date().toISOString(),
    };

    try {
      await updateUser(userId, {
        name: user.name,
        lastProcessed: new Date().toISOString(),
      });
    } catch (error: unknown) {
      console.error('更新用户失败:', error);
    }

    return { result: processedData };
  }
}
