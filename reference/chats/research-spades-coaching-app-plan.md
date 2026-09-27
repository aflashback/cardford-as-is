# Research Spades Coaching App Plan

Source chat: https://chatgpt.com/c/6ab7492f-5ef8-83e9-ae52-bba4498fe4e0

Exported: 2026-09-26. Historical reference, not current implementation instructions. All turns returned by the chat reader are included. Original citation markers were preserved, but their target URLs were not exposed by the chat reader. Linked sandbox files are not embedded in this export.

## User

Research plan and prepare a setup for a based game using AI and the game is basically not for playing but for coaching similar to how chest.com coaches used to play chess we need that to become an app that coaches you how to play cards game like spades the point is we use Jeff model in our plan to play to become the player that makes the decision and anything else around that can be determinist figured out needs to be to stay as part of the program. The rest of the AI thinking should be in the system. One Jeff type integration we need to prepare for such a plan so I can give it to frontier models, or sub agent, etc. that will be able to execute and generate a full working webpage app that users can play with any responsive form factor like on a phone on a desktop, etc. we don’t have to think about monetizing this will first make it work. Prepare the plan first do the research we’re not going to implement anything prepare files that we need to use in this plan make them exactly the way that you would spec software, and the language the technology tech you can make all the decisions that are necessary to make this work and will change as we go because this will be several restorations

## User

Our design should consider later on adding different types of games. All of them are card games that can be played for four players and maybe played individually or a pair of like two teams.
The design should be flexible enough to add this those features and support adding new capabilities. The design also should be not so graphical just enough for the cards to show properly and the four players on the table. The players can be just simple, icons or simple avatars then that’s it.

## Assistant

The plan now treats this as a **four-player card-coaching platform, with Spades as its first game module**. Individual play, two-team play, and the minimal interface are built into the specification—not left as a future refactor.

## Specification files

**:chatgpt-content-reference{index="7"}[Download the complete specification pack — ZIP](sandbox:/mnt/data/card-coach-spec-v0.2.zip)**

:chatgpt-content-reference{index="8"}[Read the plan overview](sandbox:/mnt/data/card-coach-spec-v0.2/PLAN-OVERVIEW.md) · :chatgpt-content-reference{index="9"}[Read the multi-game architecture](sandbox:/mnt/data/card-coach-spec-v0.2/docs/12-multi-game-extensibility.md) · :chatgpt-content-reference{index="10"}[Read the coding-agent kickoff](sandbox:/mnt/data/card-coach-spec-v0.2/prompts/START-HERE.md)

The package contains **12 specification documents, 14 JSON schemas, an OpenAPI contract, example fixtures, research references, and bounded coding-agent work packets**. It is versioned as **0.2**, incorporating your latest requirements.

## Architecture decisions

| Area | Decision |
|---|---|
| **Players** | Four seats: North, East, South, West. Initially, one human and three Jev-controlled players. |
| **Competition** | Explicitly support either four individual competitors or two teams of two. Seating, team membership, and information access remain separate. |
| **Game modules** | Each game owns its rules, phases, legal actions, scoring, objectives, observations, Jev instructions, and teaching content. |
| **Shared platform** | Reuse sessions, persistence, decision processing, hints, review, retries, progress tracking, and the four-seat interface. |
| **First release** | Implement partnership Spades only. Include a small **test-only individual-play module** to verify that the shared platform does not depend on Spades. |
| **Visual design** | Readable cards, a flat table, four simple icons or initials, compact status, and a coaching panel. No 3D, illustrated characters, elaborate animation, or avatar-customization system. |

The important distinction is that **individual play is not simply a “disable teams” switch**. Each game variant must define its own legal rules and objective. The shared platform therefore does not assume that a partner exists, that every game has bidding or trump, or that taking more tricks is desirable.

Future features such as passing cards, drawing, discarding, selecting several cards, or making simultaneous hidden decisions have explicit extension points. They still require working handlers and tests before a game can advertise those capabilities.

One researched constraint is already accounted for: Jev’s documented `Choice` interface currently allows **up to 255 options**. A future game with many multi-card combinations will need an explicit selection protocol rather than silently dropping legal options. :chatgpt-content-reference{index="0"}

## How Jev and ordinary code are separated

The proposed decision flow is:

**Player-visible observation → code-computed facts and legal options → Jev selects an option → server validates and applies it.**

Jev’s documented API supports selecting from supplied choices and returning the selected option, probabilities, and confidence. That makes it an interface fit for this bounded decision role; it does not, by itself, establish playing strength. :chatgpt-content-reference{index="1"}

**Code remains responsible for rules, card counting, turn order, trick resolution, scoring, permissions, replay, and persistence.** This also follows Jev’s published limitations, which specifically recommend keeping arithmetic and counting in code. :chatgpt-content-reference{index="2"}

Each bot receives only its own cards and permitted public information. The human coach uses the human’s information as it existed before the decision—not opponents’ cards revealed later. This distinction between a player’s information set and the complete game state is fundamental to imperfect-information games. :chatgpt-content-reference{index="3"}

The coaching interface separates **verified facts**, **authored exercise answers**, and **Jev’s strategic suggestions**. It will not call another legal move a mistake merely because Jev preferred something else. Jev’s confidence summarizes its output distribution; the plan does not treat it as a probability of winning or proof of an optimal move. :chatgpt-content-reference{index="4"}

## Coaching experience and technology

The learning flow is **play → receive brief feedback → review → retry → practise a related skill**. Guided feedback, hints, review, and retries are the useful interaction patterns drawn from Chess.com—not its branding or chess-specific accuracy claims. :chatgpt-content-reference{index="5"}

I selected **TypeScript, React with Vite, Node.js, Fastify, and SQLite**, with semantic HTML/CSS for cards and the table. The initial deployment is one server process with a bounded job worker and persistent local storage. The implementation plan does not introduce Redis, a message broker, a graphical game engine, or a runtime agent framework.

Frontier models and subagents are **development tools for building the application**. They are not part of the shipped coaching runtime.

## What the pack specifies

| Files | Contents |
|---|---|
| **Product and rules** | Scope, requirements, exact Spades variant, Nil and bag scoring, completion rules, and acceptance criteria. |
| **Architecture and extensibility** | Shared versus game-owned responsibilities, module interfaces, individual/team configuration, capabilities, and versioning. |
| **Jev and coaching** | Provider contract, observation boundaries, prompt structure, factual templates, hints, review, retries, and evaluation gates. |
| **UX, API, and operations** | Minimal responsive layouts, accessibility requirements, safe API views, persistence, recovery, security, and deployment boundaries. |
| **Agent handoff** | Build kickoff, work ownership, staged delivery, verification requirements, and a separate future “add a game” packet. |

I checked the planning files locally: schema validity, example/schema agreement, internal references, API structure, and the twelve scoring fixtures. The package includes a validation report distinguishing those checks from future application tests.

**No application was implemented and no live Jev evaluation was performed.** The first implementation milestone includes an authenticated Jev trial and a deterministic engine—not just a polished table. Jev’s usefulness as a strategic coach remains something to measure.

When implementation begins, give the coding agent the **whole extracted folder**, starting with `AGENTS.md` and `prompts/START-HERE.md`; the overview alone does not contain the contracts and safeguards needed for the build.

