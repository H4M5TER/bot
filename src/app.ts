import { db, app } from "./config"
import { LiveTCP } from "bilibili-live-ws"
import axios, { AxiosRequestConfig } from "axios"

interface Term {
    group: number;
    user: number;
    count: number;
    task: Task[]
}
interface Task {
    id: number
    message: string;
}
interface UnwindedTask {
    task: Task
}

app.receiver.on("message", (meta) => {
    console.log(meta.groupId)
    console.log(meta.userId)
})

app.command("添加待办 <待办事项...>", { authority: 0 })
    .action(async ({ meta }, _message) => {
        let collection = db.collection<Term>("task")
        let tasks = await collection.findOne({ group: meta.groupId, user: meta.userId })
            .catch((e: Error) => console.error(e))
        if (null === tasks || tasks === void 2) {
            collection.insertOne({
                group: meta.groupId!,
                user: meta.userId!,
                count: 1,
                task: [{
                    id: 1,
                    message: _message
                }]
            }).catch((e: Error) => console.error(e))
            collection.createIndex({
                user: 1,
                group: 1
            })
        }
        else {
            collection.updateOne({
                group: meta.groupId,
                user: meta.userId
            }, {
                $push: {
                    task: {
                        id: tasks.count + 1,
                        message: _message
                    }
                },
                $inc: {
                    count: 1
                }
            }).catch((e: Error) => console.error(e))
        }
        meta.$send!("添加成功")
    })


app.command("我的待办", { authority: 0 })
    .action(async ({ meta }) => {
        db.collection<Term>("task").aggregate([{
            $match: {
                group: meta.groupId,
                user: meta.userId
            }
        }, {
            $project: {
                _id: false,
                task: true
            }
        }, {
            $unwind: "$task"
        }]).toArray().then((unwinded_tasks: any) => { // 这个 any 是去不掉了
            let message = ""; //
            (<Array<UnwindedTask>>unwinded_tasks).forEach(({ task }) => {
                // 更好的做法？
                message += task.id + ". " + task.message + "\n"
            })
            meta.$send!(message)
                .catch((e: Error) => console.error(e))
        }).catch((e: Error) => console.error(e))
    })

app.command("删除待办 <待办ID>", { authority: 0 })
    .action(({ meta }, _id) => {
        let id = parseInt(_id)
        let collection = db.collection<Term>("task")
        collection.aggregate([{
            $match: {
                group: meta.groupId,
                user: meta.userId
            }
        }, {
            $project: {
                _id: false,
                task: true
            }
        }, {
            $unwind: "$task"
        }, {
            $match: {
                "task.id": {
                    $ne: id
                }
            }
        }]).toArray().then((unwinded_tasks: any) => {
            let new_array: Task[] = [];
            (<Array<UnwindedTask>>unwinded_tasks).forEach(({ task }) => {
                if (task.id > id)
                    task.id -= 1
                new_array.push(task)
            })
            collection.updateOne({
                group: meta.groupId,
                user: meta.userId
            }, {
                $set: {
                    task: new_array
                },
                $inc: {
                    count: -1
                }
            }).catch((e: Error) => console.error(e))
        }).catch((e: Error) => console.error(e))
        meta.$send!("删除成功")
    })

app.command("排序待办 <初始序号> <目标序号>", { authority: 0 })
    .action(async ({ meta }, _id, _target_id) => {
        let id = parseInt(_id), target_id = parseInt(_target_id), left: number, right: number, inc: number
        if (id > target_id)
            [left, right, inc] = [target_id, id - 1, 1]
        else
            [left, right, inc] = [id + 1, target_id, -1]
        let collection = db.collection<Task>("task")
        collection.aggregate([{
            $match: {
                group: meta.groupId,
                user: meta.userId
            }
        }, {
            $project: {
                _id: false,
                task: true,
                count: true
            }
        }, {
            $unwind: "$task"
        }]).toArray().then((unwinded_tasks: any) => {
            if (id <= 0 || id > unwinded_tasks.count || target_id <= 0 || target_id > unwinded_tasks.count) {
                meta.$send!("序号超出范围")
                return
            }
            let new_array: Array<Task> = []
            let target_task: Task
            (<Array<UnwindedTask>>unwinded_tasks).forEach(({ task }) => {
                if (task.id !== id) {
                    if (left <= task.id && task.id <= right)
                        task.id += inc
                    new_array.push(task)
                }
                else {
                    task.id = target_id
                    target_task = task
                }
            })
            new_array.splice(target_id - 1, 0, target_task!)
            collection.updateOne({
                group: meta.groupId,
                user: meta.userId
            }, {
                $set: {
                    task: new_array
                }
            }).catch((e: Error) => console.error(e))
        }).catch((e: Error) => console.error(e))
        meta.$send!("序号已变更")
    })

app.start()
    .catch((e: Error) => console.error(e))

interface room_info {
    data: {
        room_info: {
            title: string
        }
    }
}
let room_id = 21208533, group_id = 743492765, name = "大凤"
let room_address = `https://live.bilibili.com/${room_id}`, live_request_config: AxiosRequestConfig = {
    url: "https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom",
    method: "get",
    params: {
        room_id: room_id
    }
}
let room = new LiveTCP(room_id)
room.on("live", () => {
    console.log("直播间已连接")
})
room.on("msg", async (data) => {
    // TODO: 随机发表情包
    if (data.cmd === "LIVE") {
        app.sender.sendGroupMsg(group_id, `${name}开播了[CQ:at,qq=all]\n${(await axios.request<room_info>(live_request_config)).data.data.room_info.title}\n${room_address}`)
        app.sender.setGroupWholeBan(group_id, true)
    }
    if (data.cmd === "PREPARING") {
        app.sender.sendGroupMsg(group_id, `${name}下播了`)
        app.sender.setGroupWholeBan(group_id, false)
    }
})
room.on("error", e => console.error(e))

interface Card {
    card: string,
    desc: {
        dynamic_id_str: string,
        timestamp: number
    }
}
interface SpaceHistory {
    data: {
        cards: Card[]
    }
}
interface Picture {
    img_src: string
}
let user_id = 281426315, polling_delay = 60 * 1000, last_ts: number
let dynamic_request_config: AxiosRequestConfig = {
    url: "https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/space_history",
    method: "get",
    params: {
        host_uid: user_id,
        need_top: false
    }
}
let polling_dynamic = async () => {
    (await axios.request/*<SpaceHistory>*/(dynamic_request_config)
        .then(resp => resp.data.data.cards)
        // axios即使catch了也不收窄类型就离谱 
        // void | AxiosResponse 不存在成员 data
        // 直接导致了这个傻逼then
        .catch((e: Error) => console.error(e)))
        // 本来request<SpaceHistory>就有类型标注了
        // 结果没有类型收窄又是 void | Card[] 不存在成员 filter
        // 直接导致这里连用三个any
        .filter((v: any) => v.desc.timestamp > last_ts)
        .map((v: any) => <Object>{ ...JSON.parse(v.card).item, address: `https://t.bilibili.com/${v.desc.dynamic_id_str}` })
        .forEach((v: any) => {
            if (v.category === "daily") {
                app.sender.sendGroupMsg(group_id, `${name}发布了相簿:\n${v.address}\n${v.description}\n${v.pictures.map(({ img_src }: Picture) => `[CQ:image,file=${img_src}]`).join(" ")}`)
            }
            else {
                app.sender.sendGroupMsg(group_id, `${name}发布了动态:\n${v.address}\n${v.content}`)
            }
        })
    setTimeout(polling_dynamic, polling_delay)
}
axios.request<SpaceHistory>(dynamic_request_config).then(resp => {
    if (last_ts = resp.data.data.cards[0].desc.timestamp)
        // 任何falsy value都throw 包括 0 undefined null
        setTimeout(polling_dynamic, polling_delay)
    else
        throw "连接动态失败";
}).catch(e => console.error(e))
