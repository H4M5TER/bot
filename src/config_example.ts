import { App } from "koishi"
import { MongoClient, Db } from "mongodb"

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

const app = new App({
    type: "http",
    port: 8080,
    server: "http://localhost:5700",
    selfId: 123456789
})

interface LiveDetectionConfig {
    liver: string,
    room: number
}
let live: LiveDetectionConfig = {
    liver: "",
    room: 123456,
}

interface DynamicRelayConfig {
    uid: number,
    delay: number,
}
let dynamic: DynamicRelayConfig = {
    uid: 123456789,
    delay: 30 * 1000
}

let groups: number[] = [
    123456789
]

export { db, app, live, dynamic, groups }
