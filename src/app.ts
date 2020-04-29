import { app, user, config, groups } from "./config"
import { LiveTCP } from "bilibili-live-ws"
import axios, { AxiosRequestConfig } from "axios"
import { appendFile } from "fs"

app.receiver.on("message", async (meta) => {
    try {
        console.log(
            `${(new Date(meta.time! * 1000)).toLocaleTimeString()}${(await app.sender.getGroupInfo(meta.groupId!)).groupName}(${meta.groupId})`
            + `\n\t${meta.sender?.nickname}(${meta.userId}):${meta.message}`)
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
room.on("msg", async (data) => {
    try {
        if (data.cmd === "DANMU_MSG") {
            let date = new Date()
            appendFile(`danmaku_${date.toLocaleDateString()}.log`,
                `[${date.toLocaleTimeString()}]${data.info[2][1]}(${data.info[2][0]}):${data.info[1]}\n`,
                () => { })
        }
        if (data.cmd === "LIVE") {
            for (let group_id of groups)
                app.sender.sendGroupMsg(group_id,
                    `${user.nickname}开播了[CQ:at,qq=all]`
                    + `\n${(await axios.request<RoomInfo>(live_request_config)).data.data.room_info.title}`
                    + `\n${room_address}`)
            app.sender.setGroupWholeBan(743492765, true)
        }
        if (data.cmd === "PREPARING") {
            for (let group_id of groups)
                app.sender.sendGroupMsg(group_id,
                    `${user.nickname}下播了[CQ:at,qq=all]`
                    + `\n${(await axios.request<RoomInfo>(live_request_config)).data.data.room_info.title}`
                    + `\n${room_address} `)
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
        timestamp: number
        dynamic_id_str: string
        orig_type: number
        orig_dy_id_str: string
        origin?: {
            bvid: string
        }
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
    address: string
    content?: string
    cover?: string
}
interface ReOrganizedCard extends Item {
    address: string
    time: string
    origin?: Origin
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
        let cards = (await axios.request<SpaceHistory>(dynamic_request_config))
            .data.data.cards
            .filter(v => v.desc.timestamp > last_ts)
            .map<ReOrganizedCard>(v => {
                let card: ParsedCard = JSON.parse(v.card)
                let result: ReOrganizedCard = {
                    ...card.item,
                    time: `[${new Date(v.desc.timestamp * 1000).toLocaleString()}]`,
                    address: `https://t.bilibili.com/${v.desc.dynamic_id_str}`,
                }
                if (v.desc.orig_type === 8)
                    result.origin = {
                        type: 8,
                        address: `https://b23.tv/${v.desc.origin!.bvid}`,
                        cover: JSON.parse(card.origin!).pic
                    }
                else if (v.desc.orig_type === 4)
                    result.origin = {
                        type: 4,
                        address: `https://t.bilibili.com/${v.desc.orig_dy_id_str}`,
                        content: JSON.parse(card.origin!).item.content
                    }
                else if (v.desc.orig_type !== 0)
                    throw "未知的orig_type属性"
                return result
            })
        for (let card of cards) {
            if (card.timestamp > last_ts)
                last_ts = card.timestamp
            if (card.category !== undefined) { // 未知
                if (card.category === "daily") // 带图片的动态
                    for (let group_id of groups)
                        app.sender.sendGroupMsg(group_id,
                            `${card.time}${user.nickname}发布了相簿:`
                            + `\n${card.description}`
                            + `\n${card.pictures!.map(({ img_src }) => `[CQ:image,file=${img_src}]`).join(" ")}`
                            + `\n${card.address}`)
            } else if (card.origin !== undefined) // 有源的动态
                if (card.origin.type === 8) // 转发视频
                    for (let group_id of groups)
                        app.sender.sendGroupMsg(group_id,
                            `${card.time}${user.nickname}分享了视频:`
                            + `\n${card.content}`
                            + `\n${card.address}`
                            + `\n[CQ:image,file=${card.origin.cover}]`
                            + `\n${card.origin.address}`)
                else if (card.origin.type === 4) // 转发动态
                    for (let group_id of groups)
                        app.sender.sendGroupMsg(group_id,
                            `${card.time}${user.nickname}转发了动态:`
                            + `\n${card.content}`
                            + `\n${card.address}`
                            + `\n${card.origin.content}`
                            + `\n${card.origin.address}`)
                else
                    throw "未知的源类型"
            else // 普通动态
                for (let group_id of groups)
                    app.sender.sendGroupMsg(group_id,
                        `${card.time}${user.nickname}发布了动态:`
                        + `\n${card.content}`
                        + `\n${card.address}`)
        }
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
