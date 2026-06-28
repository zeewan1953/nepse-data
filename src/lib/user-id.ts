"use client";

let _uid: string | null = null;

export function getUserId(): string {
  if (typeof window === "undefined") return "server";
  if (_uid) return _uid;
  let uid = localStorage.getItem("axion-device-id");
  if (!uid) {
    uid = crypto.randomUUID();
    localStorage.setItem("axion-device-id", uid);
  }
  _uid = uid;
  return uid;
}
