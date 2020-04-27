import { app, user, config, groups } from "./config"
import { LiveTCP } from "bilibili-live-ws"
import axios, { AxiosRequestConfig } from "axios"
import { appendFile } from "fs"

app.receiver.on("message", async (meta) => {
    try {
        console.log(`${(new Date(meta.time!)).toLocaleTimeString()}${(await app.sender.getGroupInfo(meta.groupId!)).groupName}(${meta.groupId})\n\t${meta.sender?.nickname}(${meta.userId}):${meta.message}`)
    } catch (e) {
        console.error(e)
    }
})

app.start()
    .catch((e: Error) => console.error(e))

interface RoomInfo {
    data: {
        room_info: {
            title: string
        }
    }
}
let room_address = `https://live.bilibili.com/${user.room_id}`, live_request_config: AxiosRequestConfig = {
    url: "https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom",
    method: "get",
    params: {
        room_id: user.room_id
    }
}
let room = new LiveTCP(user.room_id)
room.on("live", () => {
    console.log("直播间已连接")
})
room.on("msg", (data) => {
    try {
        if (data.cmd === "DANMU_MSG") {
            let date = new Date()
            appendFile(`danmaku_${date.toLocaleDateString()}.log`, `[${date.toLocaleTimeString()}]${data.info[2][1]}(${data.info[2][0]}):${data.info[1]}`, () => { })
        }
        if (data.cmd === "LIVE") {
            groups.forEach(async group_id => {
                // TODO: 随机发表情包
                app.sender.sendGroupMsg(group_id, `${user.nickname}开播了[CQ:at,qq=all]\n${(await axios.request<RoomInfo>(live_request_config)).data.data.room_info.title}\n${room_address}`)
            })
            app.sender.setGroupWholeBan(743492765, true)
        }
        if (data.cmd === "PREPARING") {
            groups.forEach(async group_id => {
                app.sender.sendGroupMsg(group_id, `${user.nickname}开播了[CQ:at,qq=all]\n${(await axios.request<RoomInfo>(live_request_config)).data.data.room_info.title}\n${room_address}`)
            })
            app.sender.setGroupWholeBan(743492765, false)
        }
    } catch (e) {
        console.error(e)
    }
})
room.on("error", e => console.error(e))

interface Card {
    card: string,
    desc: {
        dynamic_id_str: string
        orig_type?: number
        origin?: {
            bvid: string
        }
        timestamp: number
    }
}
interface Picture {
    img_src: string
}
interface Item {
    content?: string
    category?: string
    description?: string
    pictures?: Picture[]
    timestamp: number
}
interface ParsedCard {
    item: Item
    origin?: string
}
interface Origin {
    type: number
    bvid?: string
    cover?: string
}
interface ReOrganizedCard extends Item, Origin {
    address: string
}
interface SpaceHistory {
    data: {
        cards: Card[]
    }
}
let last_ts: number
let dynamic_request_config: AxiosRequestConfig = {
    url: "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/space_history",
    method: "get",
    params: {
        host_uid: user.user_id,
        need_top: false
    }
}
let polling_dynamic = async () => {
    try {
        (await axios.request<SpaceHistory>(dynamic_request_config))
            .data.data.cards
            .filter(v => v.desc.timestamp > last_ts)
            .map(v => {
                let card: ParsedCard = JSON.parse(v.card)
                return <ReOrganizedCard>{
                    ...card.item,
                    address: `https://t.bilibili.com/${v.desc.dynamic_id_str}`,
                    type: v.desc.orig_type,
                    bvid: v.desc.origin!.bvid,
                    cover: JSON.parse(card.origin!)?.pic
                }
            })
            .forEach(async v => {
                if (v.timestamp > last_ts)
                    last_ts = v.timestamp
                if (v.category !== undefined) { // 未知
                    if (v.category === "diary") // 带图片的动态
                        groups.forEach(async group_id => {
                            app.sender.sendGroupMsg(group_id, `${user.nickname}发布了相簿:\n${v.address}\n${v.description}\n${v.pictures!.map(({ img_src }) => `[CQ:image,file=${img_src}]`).join(" ")}`)
                        })
                } else if (v.type != undefined) // 有源的动态
                    // switch的缩进也太多了
                    if (v.type === 8) // 转发视频
                        groups.forEach(async group_id => {
                            app.sender.sendGroupMsg(group_id, `${user.nickname}分享了视频:\n${v.address}\n${v.content}\nhttps://b23.tv/${v.bvid}\n[CQ:image,file=${v.cover!}`)
                        })
                    else if (v.type === 4) // 转发动态
                        ;
                    else
                        throw "未知的源类型"
                else // 普通动态
                    groups.forEach(async group_id => {
                        app.sender.sendGroupMsg(group_id, `${user.nickname}发布了动态:\n${v.address}\n${v.content}`)
                    })
            })
    } catch (e) {
        console.error(e)
    }
    setTimeout(polling_dynamic, config.delay)
}
axios.request<SpaceHistory>(dynamic_request_config).then(resp => {
    if (last_ts = resp.data.data.cards[0].desc.timestamp) {
        // 任何falsy value都throw 包括 0 undefined null
        setTimeout(polling_dynamic, config.delay)
        console.log("动态已连接")
    }
    else
        throw "连接动态失败";
}).catch(e => console.error(e))
