import { MongoClient, Db } from "mongodb"
import { App } from "koishi"
import "koishi-adapter-onebot"
import { Config, User } from "./config.d"

const app = new App({
    type: "onebot:http",
    port: 8080,
    server: "http://localhost:5700",
    selfId: 123456789
})
let user: User = {
    user_id: 123456789,
    room_id: 123456,
    nickname: ""
}
let config: Config = {
    delay: 30 * 1000
}
let groups: number[] = [
    123456789
]
let db: Db;
MongoClient.connect("mongodb://localhost:27017/", {
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

export { db, app, user, config, groups }
