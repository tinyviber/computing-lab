# Human pre-flight protocol

Status: prepared; requires real Chinese high-school students/teachers. Simulated studies cannot close the remaining human-legibility uncertainty.

## Instructions

Do not reveal the target concept before the session. Give the student only the URL, the worksheet, and: “请自由尝试这个实验，觉得有意思的地方可以多试几次。” Do not rescue the student unless they are blocked for 60 seconds or ask for help. Record exact teacher intervention.

## Worksheet — Protocol Process

PRE:

1. 如果消息发出后一直没有回复，发送方能确定什么？
2. 同一条消息到达两次，接收方一定会执行两次吗？

POST:

1. 你觉得这个实验主要想说明什么？
2. 哪一步让你改变了原来的想法？
3. 第一次数据 0 ms 发出并丢失；100 ms 超时；重试 40 ms 后到达。接收方执行几次？发送方何时成功？
4. 哪个词、按钮或图最难理解？

Observer: first click; first hesitation; whether “当前这一步”/queue was found; whether receiver state and sender knowledge were separated; help request; teacher wording.

## Worksheet — Audio Encoding

PRE:

1. 每秒取更多样本，可能改变什么？
2. 每个样本允许更多等级，可能改变什么？

POST:

1. 你觉得这个实验主要想说明什么？
2. 18 kHz 声音用 30 kHz 采样时，为什么可能听成较低频率？改哪个条件？
3. 哪个词、按钮或图最难理解？

Observer: first control; whether student separates sampling frequency from quantization bits; whether “混叠” is explained from evidence; whether playback and analysis are confused.

## Worksheet — Relational Data

PRE:

1. 空文本和“没有值”是同一件事吗？
2. 子表记录找不到对应父表记录时，查询结果会怎样？

POST:

1. 你觉得这个实验主要想说明什么？
2. 这条结果来自哪些原始记录？哪条缺失会让结果消失？
3. 一个外键值是 `""`，另一个是 `NULL`；你会如何处理？
4. 哪个词、按钮或图最难理解？

Observer: whether source rows are understood without the word provenance; whether NULL/empty is distinguished; whether query steps are found; teacher help.

## Shared observer fields

- Date/version:
- Device/viewport:
- First click:
- Hesitation:
- Ignored control:
- First request for help:
- Surprising moment:
- Incorrect mental model:
- Teacher intervention and exact words:
- Could student explain mechanism from visible evidence?
- Could student answer unseen transfer without reopening page?
