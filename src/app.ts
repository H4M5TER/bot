import { db, app } from "./config"

app.receiver.on("message", (meta) => {
    console.log(meta.groupId)
    console.log(meta.userId)
})

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
