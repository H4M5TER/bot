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

let live_request_config: AxiosRequestConfig = {
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
let room_address = `https://live.bilibili.com/${user.room_id}/`
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
                    + `\n${(await axios.request(live_request_config)).data.data.room_info.title}`
                    + `\n${room_address}`)
            app.sender.setGroupWholeBan(743492765, true)
        }
        if (data.cmd === "PREPARING") {
            for (let group_id of groups)
                app.sender.sendGroupMsg(group_id,
                    `${user.nickname}下播了[CQ:at,qq=all]`
                    + `\n${(await axios.request(live_request_config)).data.data.room_info.title}`
                    + `\n${room_address} `)
            app.sender.setGroupWholeBan(743492765, false)
        }
    } catch (e) {
        console.error(e)
    }
})
room.on("error", e => console.error(e))

let last_ts: number = 0
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
        let cards = (await axios.request(dynamic_request_config)).data.data.cards
        let new_cards = cards.filter(({ desc }) => desc.timestamp > last_ts)
        for (let { desc } of new_cards)
            if (desc.timestamp > last_ts)
                last_ts = desc.timestamp
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
                result.verb = "发布了动态"
                result.content = card.item.content
            } else if (desc.type === 2) {
                // 相簿
                result.verb = "发布了相簿"
                result.content =
                    `${card.item.description}`
                    + `\n${card.item.pictures.map(({ img_src }) => `[CQ:image,file=${img_src}]`).join(" ")}`
            } else if (desc.type === 1) { // 转发
                let origin = JSON.parse(card.origin)
                result.origin = {}
                result.content = card.item.content
                result.origin.address = `https://t.bilibili.com/${desc.orig_dy_id_str}/`
                if (desc.orig_type === 8) {
                    result.verb = "分享了视频"
                    result.origin.content = `${origin.title}\n[CQ:image,file=${origin.pic}]`
                    result.origin.address = `https://b23.tv/${desc.origin.bvid}/`
                }
                else if (desc.orig_type === 4) {
                    result.verb = "转发了动态"
                    result.origin.content = origin.item.content
                }
                else if (desc.orig_type === 2) {
                    result.verb = "转发了相簿"
                    result.origin.content =
                        `${origin.item.description}`
                        + `\n${origin.pictures.map(({ img_src }) => `[CQ:image,file=${img_src}]`).join(" ")}`
                }
                else if (desc.orig_type !== 0)
                    throw `未知的orig_type字段值:${desc.orig_type}`
            } else if (desc.type === 8) {
                // 视频
                result.verb = "发布了视频"
                result.content = card.dynamic
                result.address = `https://b23.tv/${desc.bvid}/`
            }
            return result
        })
        for (let message of messages)
            if (message.type !== 1)
                for (let group_id of groups)
                    app.sender.sendGroupMsg(group_id,
                        `[${message.time}]${user.nickname}${message.verb}`
                        + `\n${message.content}`
                        + `\n${message.address}`
                    )
            else
                for (let group_id of groups)
                    app.sender.sendGroupMsg(group_id,
                        `[${message.time}]${user.nickname}${message.verb}`
                        + `\n${message.content}`
                        + `\n${message.address}`
                        + `\n\n${message.origin.content}`
                        + `\n${message.origin.address}`
                    )
    } catch (e) {
        console.error(e)
    }
    setTimeout(polling_dynamic, config.delay)
}

axios.request(dynamic_request_config).then(resp => {
    if (resp?.data?.data?.cards[0]?.desc?.timestamp) {
        last_ts = resp.data.data.cards[0].desc.timestamp
        setTimeout(polling_dynamic, config.delay)
        console.log("动态已连接")
    }
    else
        throw "连接动态失败";
}).catch(e => console.error(e))
