import { kafkaClient } from "./kafka-client.js";

const admin = kafkaClient.admin();

await admin.connect();

await admin.createTopics({
  topics: [
    {
      topic: "location-updates",
      numPartitions: 3,
      replicationFactor: 1,
    },
  ],
});

console.log("Topic 'location-updates' created.");
await admin.disconnect();
