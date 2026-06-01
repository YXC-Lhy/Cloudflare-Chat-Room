
/**
 * worker.js
 * Cloudflare Worker + D1 Binding
 */

const CONFIG = {

  /**
   * 聊天室名称
   */
  ROOM_NAME: "聊天室",
  ROOM_NOTICE:"欢迎来到聊天室，请**交流。", 
  /**
   * 注册邀请码
   */
  INVITE_CODE: "hello123",

  /**
   * 登录 token
   */
  LOGIN_TOKEN: "global_chat_token",

  /**
   * 默认加载消息数量
   */
  DEFAULT_LOAD_MESSAGES: 50,

  /**
   * 最大保存消息数
   */
  MAX_SAVE_MESSAGES: 500,

  /**
   * 最大消息长度
   */
  MAX_MESSAGE_LENGTH: 500
};

/**
 * JSON 输出
 */
function json(data, status = 200){

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers:{
        "content-type":
          "application/json;charset=UTF-8",

        "access-control-allow-origin":"*",
        "access-control-allow-methods":"*",
        "access-control-allow-headers":"*"
      }
    }
  );
}

/**
 * SHA256
 */
async function sha256(text){

  const encoder =
    new TextEncoder();

  const data =
    encoder.encode(text);

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      data
    );

  return [...new Uint8Array(hash)]
    .map(v=>
      v.toString(16).padStart(2,"0")
    )
    .join("");
}

/**
 * 登录校验
 */
async function auth(env, request){

  const token =
    request.headers.get("x-token");

  const username =
    request.headers.get("x-username");

  if(
    !token ||
    !username
  ){
    return null;
  }

  if(
    token !==
    CONFIG.LOGIN_TOKEN
  ){
    return null;
  }

  const result =
    await env.DB
      .prepare(`
        SELECT *
        FROM users
        WHERE username=?
        LIMIT 1
      `)
      .bind(username)
      .all();

  if(
    !result.results.length
  ){
    return null;
  }

  return result.results[0];
}

export default {

  async fetch(request, env){

    try{

      /**
       * CORS
       */
      if(
        request.method ===
        "OPTIONS"
      ){

        return new Response(
          null,
          {
            headers:{
              "access-control-allow-origin":"*",
              "access-control-allow-methods":"*",
              "access-control-allow-headers":"*"
            }
          }
        );
      }

      const url =
        new URL(request.url);

      /**
       * 初始化数据库
       */
      if(
        url.pathname ===
        "/init"
      ){

        await env.DB
          .prepare(`
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT UNIQUE,
              password TEXT,
              created_at TEXT
            )
          `)
          .run();

        await env.DB
          .prepare(`
            CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT,
              type TEXT,
              msg TEXT,
              created_at TEXT
            )
          `)
          .run();

        return json({
          success:true
        });
      }

      /**
       * 注册
       */
      if(
        url.pathname ===
          "/register" &&

        request.method ===
          "POST"
      ){

        const body =
          await request.json();

        const inviteCode =
          String(
            body.inviteCode || ""
          ).trim();

        const username =
          String(
            body.username || ""
          ).trim();

        const password =
          String(
            body.password || ""
          ).trim();

        if(
          inviteCode !==
          CONFIG.INVITE_CODE
        ){

          return json({
            success:false,
            error:"邀请码错误"
          },403);
        }

        if(
          !username ||
          !password
        ){

          return json({
            success:false,
            error:"参数错误"
          },400);
        }

        const exists =
          await env.DB
            .prepare(`
              SELECT id
              FROM users
              WHERE username=?
              LIMIT 1
            `)
            .bind(username)
            .all();

        if(
          exists.results.length
        ){

          return json({
            success:false,
            error:"用户名已存在"
          },400);
        }

        const hash =
          await sha256(password);

        await env.DB
          .prepare(`
            INSERT INTO users (
              username,
              password,
              created_at
            )
            VALUES (?, ?, ?)
          `)
          .bind(
            username,
            hash,
            new Date().toISOString()
          )
          .run();

        return json({
          success:true
        });
      }

      /**
       * 登录
       */
      if(
        url.pathname ===
          "/login" &&

        request.method ===
          "POST"
      ){

        const body =
          await request.json();

        const username =
          String(
            body.username || ""
          ).trim();

        const password =
          String(
            body.password || ""
          ).trim();

        const hash =
          await sha256(password);

        const result =
          await env.DB
            .prepare(`
              SELECT *
              FROM users
              WHERE username=?
              AND password=?
              LIMIT 1
            `)
            .bind(
              username,
              hash
            )
            .all();

        if(
          !result.results.length
        ){

          return json({
            success:false,
            error:"账号或密码错误"
          },403);
        }

        return json({
          success:true,

          token:
            CONFIG.LOGIN_TOKEN,

          username,

          roomName:
            CONFIG.ROOM_NAME,

          defaultLoad:
            CONFIG.DEFAULT_LOAD_MESSAGES
        });
      }

      /**
       * 群信息
       */
      if(
        url.pathname === "/info" &&
        request.method === "GET"
      ){

        const countResult =
          await env.DB
            .prepare(`
              SELECT COUNT(*) AS count
              FROM users
            `)
            .first();

        return json({

          success:true,

          roomName:
            CONFIG.ROOM_NAME,

          notice:
            CONFIG.ROOM_NOTICE,

          members:
            countResult?.count || 0

        });

      }

      /**
       * 获取消息
       */
      if(
        url.pathname ===
          "/messages" &&

        request.method ===
          "GET"
      ){

        const user =
          await auth(
            env,
            request
          );

        if(!user){

          return json({
            success:false,
            error:"未登录"
          },401);
        }

        const offset =
          Number(
            url.searchParams.get(
              "offset"
            ) || 0
          );

        const limit =
          Number(
            url.searchParams.get(
              "limit"
            ) ||
            CONFIG.DEFAULT_LOAD_MESSAGES
          );

        const result =
          await env.DB
            .prepare(`
              SELECT *
              FROM messages
              ORDER BY id DESC
              LIMIT ?
              OFFSET ?
            `)
            .bind(
              limit,
              offset
            )
            .all();

        return json({
          success:true,

          roomName:
            CONFIG.ROOM_NAME,

          messages:
            result.results
        });
      }

      /**
       * 发送消息
       */
      if(
        url.pathname ===
          "/send" &&

        request.method ===
          "POST"
      ){

        const user =
          await auth(
            env,
            request
          );

        if(!user){

          return json({
            success:false,
            error:"未登录"
          },401);
        }

        const body =
          await request.json();

        const type =
          String(
            body.type || "msg"
          ).trim();

        const msg =
          String(
            body.msg || ""
          ).trim();

        if(!msg){

          return json({
            success:false,
            error:"消息为空"
          },400);
        }

        if(
          msg.length >
          CONFIG.MAX_MESSAGE_LENGTH
        ){

          return json({
            success:false,
            error:"消息太长"
          },400);
        }

        if(
          ![
            "msg",
            "graph"
          ].includes(type)
        ){

          return json({
            success:false,
            error:"消息类型错误"
          },400);
        }

        /**
         * 插入消息
         */
        await env.DB
          .prepare(`
            INSERT INTO messages (
              username,
              type,
              msg,
              created_at
            )
            VALUES (?, ?, ?, ?)
          `)
          .bind(
            user.username,
            type,
            msg,
            new Date().toISOString()
          )
          .run();

        /**
         * 自动删除旧消息
         */
        await env.DB
          .prepare(`
            DELETE FROM messages
            WHERE id NOT IN (
              SELECT id
              FROM messages
              ORDER BY id DESC
              LIMIT ?
            )
          `)
          .bind(
            CONFIG.MAX_SAVE_MESSAGES
          )
          .run();

        return json({
          success:true,
          time:
            new Date().toISOString()
        });
      }

      /**
       * 404
       */
      return json({
        success:false,
        error:"not_found"
      },404);

    }catch(err){

      return json({
        success:false,
        error:err.message
      },500);
    }
  }
};

