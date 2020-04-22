import { App } from "koishi"
import "koishi-database-mysql"

import { MongoClient, Db } from "mongodb"
let db: Db = null;
MongoClient.connect("mongodb://localhost:27017", {
    useUnifiedTopology: true
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

app.command("添加待办 <待办事项...>")
    .action(async ({ meta }, _message) => {
        let collection = db.collection("task")
        let tasks = await collection.findOne({ group: meta.groupId, user: meta.userId })
        if (null == tasks)
            collection.insertOne({ group: meta.groupId, user: meta.userId, count: 0 })
        let count = <number>tasks.count + 1
        collection.updateOne({ group: meta.groupId, user: meta.userId }, {
            $push: {
                task: {
                    id: count,
                    message: _message
                }
            },
            $set: { count: count }
        }).catch(err => console.log(err))
    })

app.start()
    .catch((err: ExceptionInformation) => { console.error(err) })
