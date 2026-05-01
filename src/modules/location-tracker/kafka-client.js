import { Kafka } from "kafkajs";

export const kafkaClient = new Kafka({
  clientId: "location-tracker",
  brokers: ["localhost:9092"],
});
