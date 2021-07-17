import { app, users, config } from './config'
import { LiveTCP } from 'bilibili-live-ws'
import axios, { AxiosRequestConfig } from 'axios'
import { appendFile } from 'fs'

app.on('message', async (session) => {
  console.log(
    `${new Date().toLocaleTimeString()} ${session.channelName}(${session.channelId})\n\t${session.username}(${session.userId}):${session.content}\n`)
})

app.start()
  .catch((e: Error) => console.error(e))

let polling_dynamic = async (user, last_ts, dynamic_request_config) => {
  try {
    let cards = (await axios.request(dynamic_request_config)).data.data.cards
    let new_cards = cards.filter(({ desc }) => desc.timestamp > last_ts)
    let messages = new_cards.map(v => {
      let desc = v.desc
      let card = JSON.parse(v.card)
      let result: any = {
        type: desc.type,
        time: new Date(desc.timestamp * 1000).toLocaleString(),
        address: `https://t.bilibili.com/${desc.dynamic_id_str}/`
      }
      if (desc.type === 4) {
        // 动态
        result.verb = '发布了动态'
        result.content = card.item.content
      } else if (desc.type === 2) {
        // 相簿
        result.verb = '发布了相簿'
        result.content =
          `${card.item.description}\n
                    ${card.item.pictures.map(({ img_src }) => `[CQ:image,file=${img_src}]`).join(' ')}`
      } else if (desc.type === 1) { // 转发
        let origin = JSON.parse(card.origin)
        result.origin = {}
        result.content = card.item.content
        result.origin.address = `https://t.bilibili.com/${desc.orig_dy_id_str}/`
        if (desc.orig_type === 8) {
          result.verb = '分享了视频'
          result.origin.content = `${origin.title}\n[CQ:image,file=${origin.pic}]`
          result.origin.address = `https://www.bilibili.com/video/${desc.origin.bvid}/`
        }
        else if (desc.orig_type === 4) {
          result.verb = '转发了动态'
          result.origin.content = origin.item.content
        }
        else if (desc.orig_type === 2) {
          result.verb = '转发了相簿'
          result.origin.content = `${origin.item.description}\n${origin.pictures.map(({ img_src }) => `[CQ:image,file=${img_src}]`).join(' ')}`
        }
        else {
          result.type = -1
          console.error(`${new Date().toLocaleTimeString()} 拉取动态:`)
          console.error(`未知的 orig_type 字段值: ${desc.orig_type}`)
          console.error(origin)
          console.error(card)
          console.error(v)
        }
      } else if (desc.type === 8) {
        // 视频
        result.verb = '更新了视频[CQ:at,qq=all]'
        result.content = card.dynamic
        result.address = `https://www.bilibili.com/video/${desc.bvid}/`
      } else {
        result.type = -1
        console.error(`${new Date().toLocaleTimeString()} 拉取动态:`)
        console.error(`未知的 type 字段值: ${desc.type}`)
        console.error(card)
        console.error(v)
      }
      return result
    })
    for (let message of messages)
      if (message.type === -1)
        app.bots[0].broadcast(user.push_groups,
          `[${message.time}]\n\n一条未知类型的动态\n\n${message.address}`)
      else if (message.type !== 1)
        app.bots[0].broadcast(user.push_groups,
          `[${message.time}]${user.nickname}${message.verb}\n\n${message.content}\n\n${message.address}`)
      else
        app.bots[0].broadcast(user.push_groups,
          `[${message.time}]${user.nickname}${message.verb}\n\n${message.content}\n${message.address}\n\n${message.origin.content}\n${message.origin.address}`)
    for (let { desc } of new_cards)
      if (desc.timestamp > last_ts)
        last_ts = desc.timestamp
  } catch (e) {
    console.error(`${new Date().toLocaleTimeString()} 拉取动态:`)
    if (e.isAxiosError) {
      if (e.response)
        console.error(`${e.response.status} ${e.response.statusText}`)
      else if (e.request)
        console.error(e.request)
      else
        console.error(e.message)
    } else
      console.error(e.toString())
  }
  setTimeout(polling_dynamic, config.delay, user, last_ts, dynamic_request_config)
}

let rooms = []
users.forEach(user => {
  // 直播间
  let live_request_config: AxiosRequestConfig = {
    url: 'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom',
    method: 'get',
    params: {
      room_id: user.room_id
    }
  }
  let room = new LiveTCP(user.room_id)
  let living = false
  room.on('live', () => {
    console.log('直播间已连接')
  })
  let room_address = `https://live.bilibili.com/${user.room_id}/`
  room.on('msg', async (data) => {
    try {
      if (data.cmd === 'DANMU_MSG') {
        let date = new Date()
        appendFile(`danmaku_${date.toLocaleDateString()}.log`,
          `[${date.toLocaleTimeString()}]${data.info[2][1]}(${data.info[2][0]}):${data.info[1]}\n`,
          () => { })
      }
      if (data.cmd === 'LIVE' && !living) {
        app.bots[0].broadcast(user.push_groups,
          `${user.nickname}开播了[CQ:at,qq=all]\n\n${(await axios.request(live_request_config)).data.data.room_info.title}\n\n${room_address}`)
        living = true
      }
      if (data.cmd === 'PREPARING') {
        app.bots[0].broadcast(user.push_groups,
          `${user.nickname}下播了`)
        living = false
      }
    } catch (e) {
      console.error(e)
    }
  })
  room.on('error', e => console.error(e))
  // 动态
  let last_ts: number = 0
  let dynamic_request_config: AxiosRequestConfig = {
    url: 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/space_history',
    method: 'get',
    params: {
      host_uid: user.user_id,
      need_top: false
    }
  }
  axios.request(dynamic_request_config).then(resp => {
    if (resp?.data?.data?.cards[0]?.desc?.timestamp) {
      last_ts = resp.data.data.cards[0].desc.timestamp
      setTimeout(polling_dynamic, config.delay, user, last_ts, dynamic_request_config)
      console.log('动态已连接')
    }
    else
      throw '连接动态失败';
  }).catch(e => console.error(e))
})
