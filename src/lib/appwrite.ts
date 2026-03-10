import { Client, Account, Databases } from "appwrite";

const client = new Client()
  .setEndpoint("https://sgp.cloud.appwrite.io/v1")
  .setProject("69afe9be000568a2139e");

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases };
