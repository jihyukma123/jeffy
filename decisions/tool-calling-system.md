### initial thoughts

so far i have implemented 

- llm client -> authenticates and links llm api 
- conversation management system -> makes stacked conversations possible. 
two systems have been implemented in the most basic form i believe

now for the next part, i think to make the llm able to 'act', i need to implement tool calling mechanism. 

for the tool calling part

i think for a primitive form, we need 2 parts. 
first, tool definitions. i need a fixed form of defining tools, and that definition and explanation has to be passed to the llm as context. 

second, i need a tool calling system. when the llm responds with a tool call, i need a mechanism to call the tool.

---

### 생각의 발전

tool calling mechanism.

tool calling what does that mean?

tool calling is mechanism for the llm to act on behalf of the user.

mostly llm based ai agents(i wont refer to them as coding agents anymore because today non technical people use llms based agents like codex very much too.) work on local computers, so the 'tools' they need are mostly the ones required to read and write files on the local filesystem.

or networks

by analyzing tools, we can learn how the computer works.

what is a tool that the computer can call?
-> what should the tool be?

and how should the tool be defined and given to the llm for it to respond with a tool call?

two problems have to be solved
