# agent 시스템 설계해보기.

전체 시스템과 각각 구성요소를 단순히 구현하는게 아니라 각각의 책임과 계약/경계를 구현하고 

이를 활용해서 ai를 써서 코드 생성을 해보는 것.

## 한 번 해보자 그냥

탑다운이니 바텁업이니 너무 이론적인걸 생각하다보니까, 어렵네

## 설계라는걸 해보자 그냥 나름대로 아는만큼.

만들고 싶은거

-> 코딩/파일처리 등 지식업무가 수행가능한 agent를 만드는 것.

이를 위해서 필요한 것
- llm 
- tools
- interface

3지가 최소한으로 필요함.

llm하고 정보 주고 받는게 필요하고,
llm에게 어떤 정보를 어떻게 처리할지에 대해서 방법을 알려주고 컴퓨터 기반 작업을 하기 위해서 tool이 필요하고,
사용자가 입력을 하고 llm response가 출력되는 response가 필요함.

하나 더 필요하네.

루프. 한 번에 처리하는게 아니라 파일 읽고-> 정보 기반으로 처리하기나 다른 파일 읽고 이렇게 처리하는게 필요하니까.

대화 기록을 누적시키는건..? 누적해야되는데 그거는 루프의 역할인가?

생각해보자 루프는...그런 역할은 아니엉야할것 같기하는 한데...

왜냐하면 루프는 생각해보면 역할이, 

'작업이 완성되지 않았다면, 이전 조건을 활용해서...다시 llm 호출을 하는건데.

근데 그 루프는 어떻게 동작하지? -> 반복적으로 llm을 호출해야되는데 문제는, 컨텍스트가 누적되어서 전달되어야하잖아. 
그냥 tool call event 가 전달되면 안되고 그러면 그래서 so what을 모르니까.

그러면 결국 대화 내역을 쌓는게 필요한건데....

그러면 이렇게 대화별로, 묶어서 context관리를 하는 메커니즘도 필요하네.

이거는 어떻게 하는건지 잘 모르겟네 흠흠....흠흠...

- llm
- tools
- interface
- looping mechanism
- context management

이렇게 다섯개는 있어야지 내가 원하는 ai agent를 구현할 수 있음.

## 설계 및 구현 순서는..?

1. 설계를 전체적으로 하고 구현한다.
2. 하나 설계 -> 하나 구현한다.

후자는 안된다고 함.
-> 왜냐하면 서로 연관이 있어서 최소한 서로의 contract는 정의가 되어야 한다.

그러면 서로 관계가 정의되어야 하겠네.


## 관계가 어찌되는가?

llm 

tools

interface

looping mechanism

context management


tools
-> 일단 이거는 비교적 간단한거 알겠어 뭔가 Type Tool 같은 형식을 만들어서 모든 툴이 이 형식에 맞춰서 구성되어서 일관되게 '호출'이 가능한 구조가 되어야하는거 알겠고.

llm
-> input을 받아서 output을 내는 구조.

interface 
-> 기본적으로 llm output을 렌더링

looping mechanism
-> 값이 있어야 하고

서로 계약이 될려면 서로 어떻게 연관되는지를 봐야할 것 같음.


interface 
-> llm 으로 user input 전달
-> llm output을 렌더링

llm에게 인풋을 줘야하고 llm의 output을 받아야 한다.

만약에 looping으로 처리할거면,

looping mechanism안에서 
-> response type같은게 tool call이면 tool call -> response를 붙여서 다시 llm call
else -> end the loop and call return response

session management
-> '대화'라는 것을 진행하기 위해서 누적해야됨. 저장하기 위한 뭔가 방법이 필요하겠네.
-> context라는건 결국 대화목록을 말하는건데 context라고 말하는게 맞나?
-> session이라는 단어가 더 적절해보임.

interface에 사용자가 텍스트 등 입력하고, 

conversation manager 같은게 있어야 하나?
loop으로 돌리면서 session 쌓고 하려면 

sudo code로 일련의 대화 흐름을 보면

```
사용자가 프로그램 시작
-> 인터페이스에 요청사항 입력 '~~해줘'
-> 인터페이스가 요청을 정해진 형식으로 담아서 conversation manager에 전달
-> conversation manager가 session이 존재하는지 확인하고, 있으면 기존 session으로 처리 없으면 새로운 sesssion 등록
-> session context를 구성해서 (새로 만들건, 아니면 기존에 새로운 요청 append 하건), context 객체를 llm manager에 전달.
-> llm manager가 llm 추론 처리 -> 받은 응답을 다시 conversation manager에 전달
-> conversation manager가 응답을 보고, tool call이네? -> tool call 을 처리
-> tool call result를 다시 context에 append 해서 llm manager에 전달
-> manager는 다시 llm 호출하고 응답 받았는데 이번에는 그냥 response네 -> interface에 response 전달.
```

여기서 data를 먼저 뽑아내고 그 다음에 관계를 봐야하나?

## LLM 한테 도움받아서 해보자.

책임지는 놈들이랑, 책임지는 놈들끼리 데이터 주고받는 형식만 정하고 시작해보자.

Interface
- 사용자 요청을 정해진 Request형식으로 구성하고,
- 사용자에게 정해진 형식의 Response를 표시한다.

ConversationManager
- session 생성/조회
- 메세지 도구 결과 기록
- Context 구성 작업

LLMClient
- Context + 도구 정의를 모델 요청 형식으로 변환
- 모델 응답을 표준화된 형식으로 변환

ToolExecutor
- 정해진 형식으로 입력된 도구를 호출하고, 결과/실패를 구조화된 형식으로 반환.

AgentRuntime
- Context를 이용해 다음 행동을 llm에게 받고
- tool call이면 실행/기록후 다시 llm call
- final response 면 conversation 매니저에게 전달하고 끝

각각 놈들이 주고받아야하는 데이터를 생각해보자.

Interface
- input: RunRequest
- output: RunResponse

ConversationManager
- 잘 모르겠넹 히히

LLMClient
- input: LlmRequest
- output: LlmResponse

ToolExecutor
- input: ToolCallRequest
- output: ToolCallResponse

AgentRuntime
- input: AgentAction
- output: AgentActionResult

Interface
-> 사용자 Input을 RunRequest로 build해서 ConversationManager에 전달

ConversationManager랑 AgentRuntime이랑 좀 헷갈리네
-> CM은 말 그대로 대화를 관리하는 친구. 대화내역을 받아서 기존 대화내역있는지 확인하고 필요하면 쌓는 애

AgentRuntime은 전체적인 orchestration을 하는 넘
말 그대로 'agentic'하게 동작하도록 해주는 애

루프 로직 담고 있고, 여러 요소들 모아서 전체 'agent'가 돌아가게 하는 친구임.

그러면

main 함수가 실행된다고 치면, 

agentruntime을 실행해서 
-> 사용자 입력을 받아서 conversation manager에 넣고, 그걸 받아서 llm call -> response 처리 로직 구현. tool call or final response
-> tool call 이면 tool executor 실행한 다음, 다시 result를 받아서 conversation manager에 넣고, 그걸 받아서 llm call -> response 처리 로직 구현. tool call or final response

반복 이런 구조이잖아.

오케이 그러면 이 과정에서 어떤 데이터를 주고 받아야 하는지 정의를 간단하게라도 하고 시작해보자.


## 근데 gemini랑 얘기를 하면서 느낀게...

너무 fancy하게 하려고 한 것 같음.

일단 working 하는 코드 한 덩어리를 만들고 분리를 고민하는게 맞지 않나 최소한으로...
