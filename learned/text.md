# tool calling mechanism 까지 만들고 느끼고 배운 점

## 1. 모든건 만들어진거지, 그냥 동작하는게 아니다.

직접 만들려고 하니까 생각보다 고려해야될 것들이 많았음.

- 계속 api call 을 해야되는데, 그 api call을 할 수 있는 환경은 어떻게 만들지?
  - llm api call을 반복적으로 하기 위해서 최초에 인증을 받고, 그 다음에 어떻게 계속 인증된 상태라는걸 유지하지?
  - 만약에 더이상 인증되지 않은 상태이거나, 뭔가 기존에 인증했던 내역을 제거해야된다면 그거는?
- agent loop 글에서 봤던대로, 
  - assemble conversation history -> latest user input -> model inference -> agent response or tool calls(in which case the 'loop' starts over by providing the model with the tool call added as the 'latest user input')
  - 이런 구조로만 보면, 'tool call'이 뭔지 정확하게 이해되지 않음. 아 뭔가 도구를 호출하는구나 싶은 정도..? llm이 모종의 tool call response를 뱉으면 뭔가 뭔가 도구가 호출되는구나.
  - 근데 실제로 구현을 하려면...
    - tool 이 뭐지?
    - tool 을 어떻게 llm 한테 제공하지?
    - llm은 tool call을 어떤 식으로 반환하지?
    - tool call을 어떻게 처리하지? 
    - 처리한 결과를 어떻게 다시 llm에 먹이지?
    - tool call 을 할지 agent response는 어떻게 구분하지?
    - 등등에 대해서 고민 및 구현이 필요하다.
- 이런 식으로 고민하다가보면 결국 구성요소들과, 추상화, 어떤 책임 요소들 가지고 있는 애들끼리 분리되어야 하는지에 대해서도 자연스럽게 같이 고민하게 됨.
  -> codex, claude code 와 같은 coding agent 들은 현재 시점에서 전세계에서 가장 많이 사용되는 'agent'이며, agentic system을 이해하는데 가장 좋은, 노하우가 많이 담겨있는 그런 프로덕트들이 아닐까?
  - 이런 걸 하나 잡고 어떤 요소들이 추상화 되어있는지, 그리고 핵심 요소들은 무엇인지를 연구해보는 것도 좋을 것 같다.
- tool definition & execution, agentic loop, conversation management, authentication 등등...어떻게 관리할 것인지?
  - 비결정적으로 동작한다는 특성 상 생기는 단점들은 어떻게 보완할 것인지?
    - sandbox, security 등등...
- 추상화가 은근히 쉽지가 않다. 
  - 일련의 필요한 작업을 생각해보고, 
  - 경계 긋는거.
  - 참고로 이번에는 처음부터 좀 깔끔하게 설계해서 시작해보려다가 실패하고,(해본적이 없고 잘 모르는데 있어보이게 설계부터 하려고 하니까 오히려 아무것도 안된다. 일단 바텀업인가..? 모르겠지만 무튼 일단 필요한대로 하나의 파일에 떄려넣어서 만드러보고, 그 다음에 돌아가게 만든걸 분리해보면서, 구조적인 관점에서 뭘 고민했어야 하는지를 깨닫는게 더 나아보인다.)
  - 오 이런 내용들 좀 괜찮은데..? 히히 develop 해볼까.

# 토큰 왜 깃허브에 올리는지 바로 깨달아버렸음...ㅋㅋㅋㅋ

나도 코드에 하드코딩해서 액세스 토큰 넣어두고 테스트용으로 개발하다가 까먹고 커밋해서 깃허브에 올려버림. ㅎㅎ

바로 깨달아버린게, 테스트용으로 쓰는거라도 민감정보는 반드시 분리하자....ㅎㅎ

실수한다 반드시, 습관을 들여야함 그런 식으로.
