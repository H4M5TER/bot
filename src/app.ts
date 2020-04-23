import { App } from "koishi"
import "koishi-database-mysql"

import { MongoClient, Db } from "mongodb"
import { AssertionError } from "assert"

let db: Db;
MongoClient.connect("mongodb://localhost:27017", {
    useUnifiedTopology: true,
    // loggerLevel: "debug"
}, (err, client) => {
    if (err != null) {
        console.error(err)
        client.close()
    }
    else {
        db = client.db("bot")
    }
})

const app = new App({
    type: "http",
    port: 8080,
    server: "http://localhost:5700",
    selfId: 2993397759,
    database: {
        mysql: {
            host: "localhost",
            port: 3306,
            user: "root",
            password: "pswd4MYSQL",
            database: "koishi"
        }
    }
})

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


app.command("添加待办 <待办事项...>", { authority: 0 })
    .action(async ({ meta }, _message) => {
        let collection = db.collection<Term>("task")
        let tasks = await collection.findOne({ group: meta.groupId, user: meta.userId })
            .catch((e: ExceptionInformation) => console.error(e))
        if (null === tasks || undefined === tasks)
            collection.insertOne({
                group: meta.groupId!,
                user: meta.userId!,
                count: 1,
                task: [{
                    id: 1,
                    message: _message
                }]
            }).catch((e: ExceptionInformation) => console.error(e))
        else {
            let count = <number>tasks.count + 1
            collection.updateOne({
                group: meta.groupId,
                user: meta.userId
            }, {
                $push: {
                    task: {
                        id: count,
                        message: _message
                    }
                },
                $set: { count: count }
            }).catch((e: ExceptionInformation) => console.error(e))
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
            //去掉这个any
        }]).toArray().then((array: any) => {
            let message = ""
            // 去掉这个any
            array.forEach(({ task }) => {
                // 更好的做法？
                message += task.id + ". " + task.message + "\n"
            })
            meta.$send!(message)
                .catch((e: ExceptionInformation) => console.error(e))
        }).catch((e: ExceptionInformation) => console.error(e))
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
        }]).toArray().then((array: any) => {
            collection.updateOne({
                group: meta.groupId,
                user: meta.userId
            }, {
                $unset: {
                    task: ""
                }
            }).catch((e: ExceptionInformation) => console.error(e))
            // 去掉这个any
            let new_array: Array<any> = []
            array.forEach(({ task }) => {
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
            }).catch((e: ExceptionInformation) => console.error(e))
        }).catch((e: ExceptionInformation) => console.error(e))
        meta.$send!("删除成功")
    })

app.start()
    .catch((e: ExceptionInformation) => console.error(e))
