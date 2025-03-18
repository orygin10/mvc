import { AWSService, DB as VDB, sqlite3InitModule } from "./dist/index.js"
import CONFIG from "./config.json" with { type: "json" }

export const AWS = new AWSService({
  ...CONFIG['aws'],
  redirectUri: window.location.origin,
  logoutUri: window.location.origin
})

const { "bucket": DB_BUCKET, "key": DB_KEY } = CONFIG['database'];

export const dbFileManager = AWS.files({ bucket: DB_BUCKET });

export class DB {
  static inner;
  static async load() {
    if (this.inner) return;
    const { content } = await dbFileManager.getObject({ key: DB_KEY, responseCacheControl: 'no-cache' });
    const sqlite3 = await sqlite3InitModule({
      print: console.log,
      printErr: console.error,
    });
    this.inner = VDB.fromArrayBuffer(sqlite3, content);
  }

  /**
  * 
  * @param {string} sql 
  * @param  {import('@sqlite.org/sqlite-wasm').BindingSpec} bind 
  * @returns {[key: string]: any}
  */
  static execute(sql, bind) {
    if (!this.inner) throw new Error("DB not loaded");
    return this.inner.execute(sql, bind);
  }
  
  static lastInsertRowId() {
    return this.execute("SELECT last_insert_rowid() as id")[0]['id'];
  }

  static async save() {
    if (!this.inner) throw new Error("DB not loaded");
    const dbBytes = this.inner.toArrayBuffer();
    await dbFileManager.putObject(dbBytes, { key: DB_KEY });
  }
}

window.addEventListener('DOMContentLoaded', async() => {
  await AWS.login({ redirect: true, throw: true });
  await DB.load();
  const res = DB.execute("SELECT * FROM sqlite_master where type = ?", ["table"]);
  console.log(res);
});
