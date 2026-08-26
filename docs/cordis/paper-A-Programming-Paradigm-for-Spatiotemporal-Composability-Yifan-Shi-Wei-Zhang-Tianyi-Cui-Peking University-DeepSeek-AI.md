# A Programming Paradigm for Spatiotemporal Composability
## Full-paper analysis, mathematical reconstruction in Markdown/LaTeX, and ACRYL implications

**Paper:** Yifan Shi, Wei Zhang, Tianyi Cui — Peking University / DeepSeek-AI  
**Length:** 88 PDF pages (substantive text through p.79; references pp.80–88)  
**Math format:** standard Markdown with LaTeX: inline `$...$`, display `$$...$$`.

> This document is a full second-pass analysis of the paper. It follows the paper's actual structure, covers every substantive section, reconstructs the numbered equations (1)–(65) in portable LaTeX, summarizes the main definitions/theorems/algorithms, and then translates the results into concrete architectural implications for ACRYL.

---

# 0. What the paper is actually claiming

The paper argues that modern dynamically composed software needs **two independent guarantees**:

1. **Temporal composability** — when a component leaves, its contribution can be removed without leaving residue and without destroying unrelated work performed meanwhile.
2. **Spatial composability** — when dependencies appear, disappear, or are replaced, consumers react coherently: activate only when requirements are satisfied, retain a stable resolution while running, and deactivate before providers are finally withdrawn.

The authors connect these to the classical dual ideas of **effects** and **coeffects**, but move them from compile-time/type-level reasoning into runtime mechanisms.

The core runtime idea is:

$$
\text{revertible effect}
\;=\;
\text{forward context transformation}
+\text{explicit inverse}
$$

and

$$
\text{reactive coeffect}
\;=\;
\text{declared environmental requirement}
+\text{runtime re-resolution}
+\text{lifecycle reaction}.
$$

These are combined into a component model:

$$
\boxed{
\mathfrak{C}_\Gamma
\coloneqq
\mathfrak{D}_\Gamma
\times
\mathfrak{P}_\Gamma
\times
\mathfrak{E}^{*}_\Gamma
}
$$

which in ordinary engineering language is:

```text
Component = requirements + provisions + effects-with-undo
```

The authors then build a dynamic operational calculus around **fibers** (live component instances), prove preservation, temporal composability, spatial ordering/coherence, progress and confluence, and implement the paradigm in **Cordis**. The production case study is **Koishi**, with 4000+ community plugins.

For ACRYL, the paper is relevant not because it provides an agent runtime directly, but because it provides a possible **composition kernel for a live, self-modifying agent runtime**.

---

# 1. Introduction — pp.4–6

## 1.1 Dimensions of composability

The paper begins by distinguishing static composition from dynamic composition. Static systems resolve function calls, module imports and inheritance before or at startup. Dynamic systems load, unload and reconfigure pieces while continuing to run.

The authors identify two axes.

### Temporal composability

Removing a component must reverse the modifications it made to the shared environment. The difficult part is that the effects are long-lived and not bounded by a lexical scope.

Examples include:

- resource allocation;
- event registration;
- timers;
- state mutation;
- process/service registration;
- dependency publication.

Static analogues such as RAII or bracket patterns know the lexical lifetime of the resource. A dynamic plugin may exist for hours, then disappear because configuration changed, source changed, a provider vanished, or an agent rewrote it.

### Spatial composability

Components need structured declarations of what they depend on, together with a runtime that resolves and re-resolves those requirements as the graph changes.

This is not merely ordinary dependency injection. The provider may arrive later, disappear while the consumer is running, or be replaced by a new identity.

The paper treats these two dimensions as **orthogonal**: correct cleanup does not by itself give dependency coordination, and dependency coordination does not by itself guarantee cleanup.

## 1.2 Motivating examples

### 1.2.1 VS Code plugin systems

The paper uses VS Code as an example of a system that supports dynamic extension installation but does not provide true fine-grained live unloading of arbitrary executable extension code. A process restart is still the coarse boundary that reliably removes all extension-host state.

The paper also criticizes the separation between activation and teardown callbacks. The effect is created in one place and cleanup is written elsewhere, making complete cleanup a matter of developer discipline rather than a structural property.

Spatially, VS Code exposes many host-owned extension points, but inter-extension structural contracts are weak; dependencies between extensions are comparatively uncommon and exported extension values are not, by default, a strong runtime compatibility mechanism.

### 1.2.2 Self-evolving agent harnesses

This subsection is directly relevant to ACRYL. The authors explicitly describe future agent harnesses that may continuously generate and deploy modifications to themselves while still serving requests.

Such harnesses may contain:

- tool suites;
- execution environments;
- permissions and sandboxing;
- session persistence;
- context/memory systems;
- subagent orchestration;
- user interfaces and automation.

Without temporal composability, frequent self-modification implies frequent process restarts, interruption of in-flight tasks, and the risk that a bad modification destroys the very runtime needed to recover.

Without spatial composability, every module has to independently notice changes in its dependencies, creating ad-hoc reload logic, hidden coupling, silent incompatibilities and reload-time cycles.

### 1.2.3 Coarse-grained workaround

The paper observes that operating systems already give a coarse form of temporal composability at **process granularity**, and container orchestrators give a coarse form of spatial composability at **service granularity**.

But this is too coarse when composition occurs inside one process. Restarting a whole process destroys caches, connections and partial computations. Splitting everything into services adds network and orchestration overhead where local calls would suffice.

The paper's thesis is therefore a **granularity match**: effects and dependency coordination should live at the same level as the components themselves.

## 1.3 Contributions

The paper's five explicit contributions are:

1. revertible effects;
2. reactive coeffects;
3. a unified context paradigm;
4. a dynamic composition calculus with system-level metatheory;
5. a practical Cordis implementation with reconciliation and HMR.

---

# 2. Preliminaries — pp.7–8

The paper uses existing effect/coeffect theory only as conceptual scaffolding. It does **not** propose another purely static effect type system; instead it reifies the corresponding structures as runtime-operable contexts.

## 2.1 Effects

The basic simply typed judgment is:

$$
\Gamma \vdash t : T.
\tag{1a}
$$

An effect system enriches this with information describing what the computation may do:

$$
\Gamma \vdash t : T^{\mathrm{effect}}.
\tag{1}
$$

The paper briefly reviews monadic effects and algebraic effects. A monad $(T,\eta,\mu)$ provides:

$$
\eta : A \to T(A)
$$

and

$$
\mu : T(T(A)) \to T(A).
$$

An algebraic-effect handler is shown schematically as:

$$
\operatorname{handle}\; e\; \operatorname{with}\;
\{\operatorname{op}(v,\kappa)\mapsto\cdots\}.
\tag{2}
$$

The key historical point is that effects characterize **what computation does to the environment**.

## 2.2 Coeffects

Coeffects enrich the context side rather than the result side:

$$
\Gamma^{\mathrm{coeffect}} \vdash t : T.
\tag{3}
$$

Coeffects characterize **what computation needs from the environment**: permissions, resources, services or contextual data.

The paper briefly discusses comonads and graded coeffects, including a preordered semiring:

$$
\mathcal{S}=(S,\le,+,\times,0,1).
$$

The point is not to import these mechanisms wholesale, but to establish the dual vocabulary:

$$
\text{effects} \leftrightarrow \text{environmental modifications}
$$

$$
\text{coeffects} \leftrightarrow \text{environmental requirements}.
$$

## 2.3 Relationship to dynamic composability

Classical effect/coeffect systems are largely static. The paper moves them into runtime because the relevant scope and dependency graph do not exist completely at compile time.

The conceptual move is:

```text
static annotation
      ↓ reification
runtime-operable context object
```

That move drives all of Section 3.

---

# 3. Revertible Effects and Reactive Coeffects — pp.9–27

This is the theoretical heart of the paper.

# 3.1 Revertible Effects — pp.9–17

## 3.1.1 Effect context

Ordinary impure computation is modeled as a pure transformation of an explicit context. If an impure function is

$$
f_{\mathrm{impure}}:X\to Y,
$$

it can be re-expressed as

$$
f:\Gamma\times X\to\Gamma\times Y.
$$

For a fixed input, its state contribution is a transformation

$$
f:\Gamma\to\Gamma.
$$

Transformations form a monoid under composition. To make them revertible, the paper pairs each forward transformation $f$ with a **left inverse** $g$.

The required direction is:

$$
g\circ f = \operatorname{id}_\Gamma
$$

where relevant; the theory does not require the stronger two-sided condition $f\circ g=\operatorname{id}_\Gamma$.

### Equation (4): twisted composition

$$
(f_1,g_1)\circ(f_2,g_2)
\coloneqq
(f_1\circ f_2,\;g_2\circ g_1).
\tag{4}
$$

The inverse order is reversed because teardown must reverse setup order.

The resulting monoid is denoted $\mathfrak{T}_\Gamma$, with unit

$$
(\operatorname{id}_\Gamma,\operatorname{id}_\Gamma).
$$

### Equation (5): effect context

$$
\partial\Gamma
\coloneqq
\Gamma\times(\Gamma\to\Gamma).
\tag{5}
$$

An element $(\gamma,\varphi)$ contains:

- current context state $\gamma$;
- accumulator $\varphi$, which recovers the prior state.

Initial state:

$$
(\gamma_0,\operatorname{id}_\Gamma).
$$

The construction can recurse:

$$
\partial^2\Gamma
=
\partial\Gamma\times(\partial\Gamma\to\partial\Gamma).
$$

### Equation (6): tracking

$$
\operatorname{track}_\Gamma(f,g)(\gamma,\varphi)
=
\left(f(\gamma),\;\varphi\circ g\right).
\tag{6}
$$

Every forward mutation extends the recovery accumulator with its inverse.

### Equation (7): projection compatibility

$$
\operatorname{pr}_1\circ\operatorname{track}_\Gamma(f,g)
=
f\circ\operatorname{pr}_1.
\tag{7}
$$

Tracking adds bookkeeping without changing the underlying forward semantics.

### Equation (8): homomorphism

$$
\operatorname{track}_\Gamma
\left((f_1,g_1)\circ(f_2,g_2)\right)
=
\operatorname{track}_\Gamma(f_1,g_1)
\circ
\operatorname{track}_\Gamma(f_2,g_2).
\tag{8}
$$

So composition before tracking and tracking before composition agree.

### Equation (9): recovery

$$
\operatorname{recover}_\Gamma(\gamma,\varphi)
=
\left(\varphi(\gamma),\operatorname{id}_\Gamma\right).
\tag{9}
$$

### Equation (10): recovery invariance

If

$$
g(f(\gamma))=\gamma,
$$

then

$$
\operatorname{recover}_\Gamma
\left(
\operatorname{track}_\Gamma(f,g)(\gamma,\varphi)
\right)
=
\operatorname{recover}_\Gamma(\gamma,\varphi).
\tag{10}
$$

This is a fundamental invariant: adding a correctly tracked effect does not change what full recovery ultimately returns.

### Equation (11): sequence recovery

For a sequence of tracked effects:

$$
\operatorname{recover}_\Gamma
\left(
\left(
\operatorname{track}_\Gamma(f_n,g_n)
\circ\cdots\circ
\operatorname{track}_\Gamma(f_1,g_1)
\right)
(\gamma,\varphi)
\right)
=
\operatorname{recover}_\Gamma(\gamma,\varphi).
\tag{11}
$$

The soundness invariant is:

$$
\varphi(\gamma)=\gamma_0
$$

or later, after observational equivalence is introduced,

$$
\varphi(\gamma)\simeq\gamma_0.
$$

## 3.1.2 Revertible effect functions

The previous construction assumed the inverse was chosen in advance. Real effects often need to discover the inverse **at application time**. For example, registering a listener returns a specific token; opening a resource returns a specific handle; inserting an item may need to capture the prior state.

### Equation (12): effect functions

$$
\mathfrak{E}_\Gamma
\coloneqq
\Gamma\to\Gamma\times(\Gamma\to\Gamma).
\tag{12a}
$$

A witnessed effect function is refined so that for

$$
e(\gamma)=(\delta,g)
$$

the returned inverse satisfies

$$
g(\delta)=\gamma.
$$

The paper writes the dependent refinement as:

$$
\begin{aligned}
\mathfrak{E}^{*}_\Gamma
\coloneqq\;&(e:\Gamma\to\Gamma\times(\Gamma\to\Gamma))\\
&\times
\Big((\gamma:\Gamma)\to
((\delta:\Gamma)\times(g:\Gamma\to\Gamma)\\
&\qquad\times(((\delta,g)=e(\gamma))\to g(\delta)=\gamma))\Big).
\end{aligned}
\tag{12}
$$

(Here the leading `a` in some PDF extraction is a typesetting artifact; the semantic content is the pair above.)

### Equation (13): effect composition

For $f,g\in\mathfrak{E}_\Gamma$:

$$
(f\diamond g)(\gamma)
=
\begin{aligned}[t]
&\mathbf{let}\;(\delta,s)=g(\gamma)\;\mathbf{in}\\
&\mathbf{let}\;(\varepsilon,t)=f(\delta)\;\mathbf{in}\\
&(\varepsilon,s\circ t).
\end{aligned}
\tag{13}
$$

The identity is

$$
\eta_\Gamma(\gamma)
=
(\gamma,\operatorname{id}_\Gamma).
$$

Theorem 10 shows $(\mathfrak{E}_\Gamma,\diamond)$ is a monoid, and Theorem 11 shows the witnessed effects $\mathfrak{E}^{*}_\Gamma$ form a submonoid.

### Equation (14): lifting effect functions

$$
\operatorname{effect}_\Gamma(e)(\gamma,\varphi)
=
\begin{aligned}[t]
&\mathbf{let}\;(\delta,g)=e(\gamma)\;\mathbf{in}\\
&\left(
(\delta,\varphi\circ g),
\operatorname{track}_\Gamma(g,\operatorname{pr}_1\circ e)
\right).
\end{aligned}
\tag{14}
$$

### Equation (15): lifting preserves effect composition

$$
\operatorname{effect}_\Gamma(f)
\diamond
\operatorname{effect}_\Gamma(g)
=
\operatorname{effect}_\Gamma(f\diamond g).
\tag{15}
$$

### Equation (16): lifted inverse behavior

If $f=\operatorname{pr}_1\circ e$, then the lifted inverse $g'$ satisfies:

$$
g'(\Delta)
=
(\gamma,\varphi\circ g\circ f).
\tag{16}
$$

The state is recovered exactly; the accumulator itself is restored under the stronger uniform-inverse condition.

Theorem 16 establishes LIFO selective reversion for a sequence of effects and shows that intermediate states preserve the soundness invariant.

## 3.1.3 Independence of effects

The problem becomes harder when effects from several components interleave. An inverse may be executed after unrelated effects have changed the state.

### Equation (17): transformation monoid

$$
\mathfrak{M}(e)
\coloneqq
\left\langle
\{\operatorname{pr}_1\circ e\}
\cup
\{\operatorname{pr}_2(e(\gamma))\mid\gamma\in\Gamma\}
\right\rangle.
\tag{17}
$$

This includes the forward transformation, all inverses the effect may produce, and every composition generated from them.

### Equation (18): commutation condition

Two effects $e_1,e_2$ require:

$$
\forall f\in\mathfrak{M}(e_1),
\forall g\in\mathfrak{M}(e_2):
\quad
f\circ g=g\circ f.
\tag{18}
$$

### Equation (19): inverse stability condition

They also require that the other effect's transformations do not change which inverse is yielded:

$$
\forall g\in\mathfrak{M}(e_2),
\forall\gamma\in\Gamma:
\quad
\operatorname{pr}_2(e_1(g(\gamma)))
=
\operatorname{pr}_2(e_1(\gamma)),
\tag{19}
$$

plus the symmetric condition.

This is stronger than saying the two composite effects commute. It says each forward map and each potential inverse of one is compatible with all transformations of the other.

**Theorem 20** is the key selective-removal result: under pairwise independence, removing one effect from an interleaved sequence yields the state the sequence would have reached had that effect never happened, while retaining the others.

**Corollary 21** then states that under pairwise independence, inverses may be applied in **any permutation** and still recover the original state.

This result is essential for independently unloadable components.

---

# 3.2 Reactive Coeffects — pp.17–22

## 3.2.1 Coeffect context

The paper formalizes dependency injection as a typed partial map.

### Equation (20): coeffect context

$$
\Sigma
\coloneqq
(k:K)\rightharpoonup\mathcal{V}_k.
\tag{20}
$$

$K$ is the key space and $\mathcal{V}_k$ is the value type associated with key $k$.

### Equation (21): `get` and `set`

$$
\operatorname{get}(k)(\sigma)=\sigma(k),
$$

and

$$
\operatorname{set}(k,v)(\sigma)
=
\left(
\sigma[k\mapsto v],
\lambda\sigma'.\,\sigma'\setminus k
\right).
\tag{21}
$$

The crucial observation is that `set` itself is a witnessed revertible effect. Publishing a dependency and withdrawing it are therefore two halves of the same tracked operation.

### Equation (22): coeffect operation

A coeffect at key $k$ includes a value type $\mathcal{V}_k$, an observational equivalence $\simeq_k$, and a set of operations $\mathcal{A}_k$.

An operation has type:

$$
a:
X_a
\to
\mathcal{V}_k
\rightharpoonup
\mathcal{V}_k
\times
(\mathcal{V}_k\rightharpoonup\mathcal{V}_k)
\times
B_a.
\tag{22}
$$

It returns a new value, an inverse and an outcome.

### Equation (23): lift to the whole coeffect context

$$
\begin{aligned}
a^{\Sigma}(x)(\sigma)
\coloneqq
&\mathbf{let}\;(v,g,b)=a(x)(\sigma(k))\;\mathbf{in}\\
&\left(
\sigma[k\mapsto v],
\lambda\sigma'.\,\sigma'[k\mapsto g(\sigma'(k))],
 b
\right).
\end{aligned}
\tag{23}
$$

Operations are confined to their own key, which later helps establish independence across distinct keys.

## 3.2.2 Specification and notification

### Equation (24): satisfaction predicate

$$
\boxed{
\sigma\models d
\iff
\forall k\in d:\;k\in\operatorname{dom}(\sigma)
}
\tag{24}
$$

### Equation (25): coeffect specification

$$
\mathfrak{D}_\Sigma
\coloneqq
\operatorname{Set}(K).
\tag{25}
$$

A component declares its requirements as a set of keys.

### Equation (26): reactive classification

$$
\operatorname{notify}_d(\sigma,\sigma')
\coloneqq
\begin{cases}
\mathrm{activating},
&\sigma\not\models d\land\sigma'\models d,\\[2mm]
\mathrm{deactivating},
&\sigma\models d\land\sigma'\not\models d,\\[2mm]
\mathrm{neutral},
&\text{otherwise}.
\end{cases}
\tag{26}
$$

The local spatial-composability guarantee becomes:

- activate only in a state satisfying the declared requirements;
- every context transition is checked against the requirement set;
- loss of satisfaction drives deactivation.

The paper notes that this local condition alone is insufficient to guarantee provider withdrawal order. A consumer may need the provider while its own teardown is running. The global calculus in Section 4 handles that.

## 3.2.3 Isolation and interception

### In-place vs derived realization

Definition 27 distinguishes two runtime realizations of an effect:

- **in-place**: mutate the context and return a nontrivial inverse;
- **derived**: leave the parent intact, create a child context with an override, and recover simply by discarding the child.

This distinction lets isolation and interception be represented as contextual derivations rather than destructive mutations.

### Equation (27): isolation context

$$
\Sigma_{\mathrm{iso}}
\coloneqq
(K\rightharpoonup R)
\times
\left((r:R)\rightharpoonup\mathcal{V}_r\right).
\tag{27}
$$

A logical key first resolves to a **realm**, then the realm resolves to a value:

$$
k\longmapsto\rho(k)\longmapsto\sigma(\rho(k)).
$$

### Equation (28): isolation operations

$$
\operatorname{get}(k)(\rho,\sigma)
=
\sigma(\rho(k)),
$$

$$
\operatorname{set}(k,v)(\rho,\sigma)
=
\left(
(\rho,\sigma[\rho(k)\mapsto v]),
\lambda(\rho',\sigma').
(\rho',\sigma'\setminus\rho'(k))
\right),
$$

$$
\operatorname{isolate}(k,r)(\rho,\sigma)
=
(\rho[k\mapsto r],\sigma).
\tag{28}
$$

Isolation is runtime ad-hoc polymorphism: one logical dependency can mean different concrete bindings in different contexts.

### Equation (29): interception context/specification

$$
\Sigma_{\mathrm{inter}}
\coloneqq
\left((k:K)\to\mathcal{M}_k\right)
\times
\left((k:K)\rightharpoonup(\mathcal{M}_k\to\mathcal{V}_k)\right),
$$

$$
\mathfrak{D}_{\mathrm{inter}}
\coloneqq
(k:K)\rightharpoonup\mathcal{M}_k.
\tag{29}
$$

Each metadata domain forms a monoid:

$$
(\mathcal{M}_k,\oplus_k,\epsilon_k).
$$

### Equation (30): interception operations

$$
\operatorname{get}(k,\mu)(\iota,\sigma)
=
\sigma(k)(\mu\oplus_k\iota(k)),
$$

$$
\operatorname{set}(k,\psi)(\iota,\sigma)
=
\left(
(\iota,\sigma[k\mapsto\psi]),
\lambda(\iota',\sigma').(\iota',\sigma'\setminus k)
\right),
$$

$$
\operatorname{intercept}(k,\nu)(\iota,\sigma)
=
(\iota[k\mapsto\iota(k)\oplus_k\nu],\sigma).
\tag{30}
$$

Interception changes **how** a capability may be used rather than which provider satisfies it. This becomes important for capability-based access control in Section 6.3.

---

# 3.3 The Context Paradigm — pp.22–27

## 3.3.1 Unified context

### Equation (31): recursive unified context

$$
\boxed{
\Gamma_{\infty}
\coloneqq
\mu\Gamma.\;
\Gamma\times(\Gamma\to\Gamma)\times\Sigma
}
\tag{31}
$$

The three parts are:

1. recursive context state;
2. accumulator of inverses;
3. coeffect/dependency context.

The recursion gives hierarchical composition: a parent context can own child contexts, and unloading a parent can aggregate and remove child effects.

The authors emphasize that $\Sigma$ can encode any shared mutable state whose interactions should be mediated, not only classic service dependencies.

## 3.3.2 Observational equivalence

Exact physical equality after rollback is often impossible or unnecessary. Freed memory need not return to the exact same heap layout; a fresh generated identity need not be numerically identical. What matters is that the recovered state is **observationally indistinguishable** through the operations exposed by the context.

### Equation (32): observational equivalence of contexts

$$
\sigma\simeq\sigma'
\iff
\operatorname{dom}(\sigma)
=
\operatorname{dom}(\sigma')
\land
\forall k\in\operatorname{dom}(\sigma):
\sigma(k)\simeq_k\sigma'(k),
$$

$$
\gamma\simeq\gamma'
\iff
\sigma_\gamma\simeq\sigma_{\gamma'}.
\tag{32}
$$

The equivalence deliberately forgets unobservable representation details.

Definition 34 builds **tests** out of coeffect operations and defines two values as indistinguishable when every possible finite test is either defined at both or neither and produces identical outcomes.

Lemma 35 proves that this indistinguishability is the coarsest equivalence respected by all operations.

### Equation (33): maps respecting equivalence

$$
\forall\gamma,\gamma'\in\Gamma:
\quad
\gamma\simeq\gamma'
\Longrightarrow
f(\gamma)\simeq f(\gamma').
\tag{33}
$$

### Equation (34): map/pair equivalence

$$
f\simeq g
\iff
\forall\gamma\in\Gamma:
 f(\gamma)\simeq g(\gamma),
$$

$$
(\delta,g)\simeq(\delta',g')
\iff
\delta\simeq\delta'
\land
g\simeq g'.
\tag{34}
$$

Definition 37 then reinterprets the witnessed-effect conditions up to $\simeq$ rather than raw equality. Lemma 38 carries all earlier recovery theorems to the observational quotient.

### Equation (35): operation independence including outcomes

$$
\forall x:X_a,
\forall g\in\mathfrak{M}(a'^{\Sigma}),
\forall\sigma\in\Sigma:
\quad
\operatorname{pr}_3
\left(
a^{\Sigma}(x)(g(\sigma))
\right)
=
\operatorname{pr}_3
\left(
a^{\Sigma}(x)(\sigma)
\right),
\tag{35}
$$

plus the symmetric condition.

**Theorem 40:** operations at distinct keys are independent. This is powerful: if two operations are truly confined to different dependency keys, their forward/inverse transformations commute structurally.

The paper then distinguishes **commutative keys** from noncommutative ones. A registry-like key, where independent entries can be added/removed, is naturally commutative. An ordered middleware chain generally is not.

### Equation (36): coeffect-mediated effects

$$
\begin{aligned}
\sigma\mapsto
&\mathbf{let}\;(\delta,s,b)=a^{\Sigma}(x)(\sigma)\;\mathbf{in}\\
&\mathbf{let}\;(\varepsilon,t)=e_b(\delta)\;\mathbf{in}\\
&(\varepsilon,s\circ t).
\end{aligned}
\tag{36}
$$

This captures multi-stage component behavior where the next action depends on the outcome of the previous coeffect operation.

**Theorem 42:** if two such effect functions operate on disjoint keys, or on the same keys under the paper's commutativity assumptions, then they are independent.

That closes the theoretical loop: **coeffect structure supplies the independence needed for temporal composability under interleaving**.

## 3.3.3 Situating the context paradigm

The authors compare three styles:

- functional explicit-state style: easy to reason about but invasive;
- imperative ambient-state style: ergonomic but dependencies/effects are hidden;
- context paradigm: an explicit first-class context mediates both mutation and dependency access.

The important practical result is **locality of concern**:

- an effect and its inverse are specified together;
- a requirement is declared once;
- the runtime composes cleanup and rewiring globally.

A component author writes local facts; the runtime derives global behavior.

---

# 4. A Calculus of Dynamic Composition — pp.28–53

Section 3 proves local properties. Section 4 builds a whole-system operational semantics where many components interleave.

# 4.1 Components and Fibers — pp.28–30

### Equation (37): component

$$
\boxed{
\mathfrak{C}_\Gamma
\coloneqq
\mathfrak{D}_\Gamma
\times
\mathfrak{P}_\Gamma
\times
\mathfrak{E}^{*}_\Gamma
}
\tag{37}
$$

A component is $(d,p,e)$:

- $d$: required dependency keys;
- $p$: keys the component may provide;
- $e$: witnessed effect function applied while active.

The base calculus assumes provisions of distinct fibers are disjoint, giving each key a unique provider in the shared realm. Isolation can relax this per realm.

### Equation (38): base lifecycle

$$
\Theta_\Gamma
\coloneqq
\mathrm{Inactive}
\mid
\mathrm{Active}(g,\omega).
\tag{38}
$$

$g$ is the accumulator; $\omega$ is the committed provider view.

A **fiber** is a live instantiation of a component. It records:

$$
\langle d,p,e,\pi,\sigma,\tau,\theta\rangle.
$$

Here $\pi$ is parent identity, $\sigma$ is the fiber's own provided table, $\tau$ is the retirement flag, and $\theta$ is lifecycle state.

### Equation (39): registry

$$
F_\gamma:
\mathfrak{N}\rightharpoonup\mathfrak{F}_\Gamma.
\tag{39}
$$

Fiber names are atomic fresh identities.

### Equation (40): effective coeffect context

$$
\sigma_\gamma
\coloneqq
\bigcup
\left\{
\sigma_m
\mid
m\in\operatorname{dom}(F_\gamma),
\theta_m=\mathrm{Active}(-,-)
\right\}.
\tag{40}
$$

The global dependency environment is **derived from active providers** rather than being a separate authoritative registry.

# 4.2 Base calculus — pp.30–33

### Equation (41): target view

$$
\operatorname{target}_n(\gamma)
\coloneqq
\begin{cases}
\bot,
&\tau_n\lor\neg(\gamma\models d_n),\\[2mm]
(k\in d_n)\mapsto\operatorname{provider}_k(\gamma),
&\text{otherwise}.
\end{cases}
\tag{41}
$$

The target is not just active/inactive. It records exactly **which provider identity** should satisfy every requirement.

That distinction is essential for replacement: two providers may expose equal values but still represent different component identities and lifecycles.

### Equation (42): base quiescence

$$
\operatorname{quiet}(\gamma)
\coloneqq
\forall n\in\operatorname{dom}(F_\gamma):
\begin{cases}
\operatorname{target}_n(\gamma)=\bot,
&\theta_n=\mathrm{Inactive},\\
\operatorname{target}_n(\gamma)=\omega_n,
&\theta_n=\mathrm{Active}(-,\omega_n).
\end{cases}
\tag{42}
$$

This is essentially desired-state reconciliation:

$$
\text{quiescent}
\iff
\text{actual lifecycle state matches resolved target state}.
$$

The base calculus has orchestration rules `O-Insert`, `O-Retire`, `O-Remove` and lifecycle rules `L-Reload`, `L-Unload`.

The orchestrator only requests existence/retirement. It does **not** directly force a component active; lifecycle rules derive that from the current target.

This is a major design philosophy: **desired composition is input; activation state is derived**.

# 4.3 Transitions in progress — pp.33–38

The base model assumes transitions are atomic, immediate and infallible. Real runtimes need multi-step teardown, async work and failure.

## 4.3.1 Withdrawal

### Equation (43): richer lifecycle

$$
\Theta_\Gamma
\coloneqq
\mathrm{Inactive}(\zeta)
\mid
\mathrm{Reloading}(i,g,\omega)
\mid
\mathrm{Active}(g,\omega)
\mid
\mathrm{Unloading}(g,\omega,\zeta).
\tag{43}
$$

### Equation (44): installed/failed predicates

$$
\operatorname{installed}_n(\gamma)
\coloneqq
\theta_n\neq\mathrm{Inactive}(-),
$$

$$
\operatorname{failed}_n(\gamma)
\coloneqq
\exists\xi\in\Xi:\;
\theta_n=\mathrm{Inactive}(\xi).
\tag{44}
$$

### Equation (45): richer quiescence

$$
\operatorname{quiet}(\gamma)
\coloneqq
\forall n\in\operatorname{dom}(F_\gamma):
\begin{cases}
\zeta\neq\bot\lor\operatorname{target}_n(\gamma)=\bot,
&\theta_n=\mathrm{Inactive}(\zeta),\\
\operatorname{target}_n(\gamma)=\omega_n,
&\theta_n=\mathrm{Active}(-,\omega_n),\\
\bot,
&\text{otherwise}.
\end{cases}
\tag{45}
$$

No in-progress transition counts as quiescent.

### Equation (46): relied-upon predicate

$$
\operatorname{relied}_n(\gamma)
\coloneqq
\exists m\in\operatorname{dom}(F_\gamma),\exists k\in d_m:
\quad
m\neq n
\land
\operatorname{installed}_m(\gamma)
\land
\omega_m(k)=n.
\tag{46}
$$

This is one of the paper's strongest practical ideas.

Provider withdrawal is split:

```text
ACTIVE
  ↓ L-Leave
UNLOADING    ← no longer advertised as provider
  ↓ wait until relied(n) = false
run accumulator
  ↓
INACTIVE
```

When a provider enters `UNLOADING`, new target resolutions stop seeing it, so dependents begin their own teardown **while the provider's binding remains readable through their committed view**. Only once those consumers are done may the provider execute its own inverse.

This is a dependency-aware drain protocol at component granularity.

## 4.3.2 Iteration

### Equation (47): effect iterator

$$
\mathfrak{E}^{\mathrm{iter}}_\Gamma
\coloneqq
\mu I.\;
\Gamma
\to
\Gamma\times(\Gamma\to\Gamma)\times\operatorname{Maybe}(I).
$$

Witnessed form:

$$
\begin{aligned}
\mathfrak{E}^{\mathrm{iter}*}_\Gamma
\coloneqq
\mu I.\;&
(e:\Gamma\to\Gamma\times(\Gamma\to\Gamma)\times\operatorname{Maybe}(I))\\
&\times
\left(
(\gamma:\Gamma)
\to
\left(
\mathbf{let}\;(\delta,g,o)=e(\gamma)\;\mathbf{in}\;g(\delta)\simeq\gamma
\right)
\right).
\end{aligned}
\tag{47}
$$

Each step yields:

- new state;
- inverse for this step;
- next continuation or termination.

This creates safe boundaries between activation stages.

### Equation (48): effect-iterator lifting

$$
\begin{aligned}
\operatorname{effect}^{\mathrm{iter}}_\Gamma(i)(\gamma,\varphi)
=
&\mathbf{let}\;(\delta,g,o)=i(\gamma)\;\mathbf{in}\\
&\mathbf{let}\;t=\operatorname{track}_\Gamma(g,\operatorname{pr}_1\circ i)\;\mathbf{in}\\
&\begin{cases}
((\delta,\varphi\circ g),t),
&o=\mathrm{Nothing},\\
\mathbf{let}\;(s,r)=
\operatorname{effect}^{\mathrm{iter}}_\Gamma(i')
(\delta,\varphi\circ g)\;\mathbf{in}\;(s,t\circ r),
&o=\mathrm{Just}(i').
\end{cases}
\end{aligned}
\tag{48}
$$

This yields LIFO partial rollback when a multi-step activation is interrupted.

The lifecycle gains `L-Begin`, `L-Iter`, `L-Finish`, `L-Divert`.

`L-Divert` is particularly important: if a target provider changes while a component is mid-activation, the transition stops at an iteration boundary and unwinds whatever it has installed so far.

## 4.3.3 Asynchrony

The paper treats async work abstractly through an opaque $\operatorname{Future}(A)$. Once an iteration is launched, it is **inertial**: it must be allowed to land. A target change during the flight cannot simply cancel the world at the model level.

The runtime therefore lets the in-flight iteration land, records its inverse, and immediately chains into unloading if the target became stale.

This gives the implementation pattern:

```text
reload may chain → unload
unload may chain → reload
```

and ensures no transient provider is exposed as ACTIVE merely because async work completed after it was already obsolete.

## 4.3.4 Failure

### Equation (49): failure-aware effect iterator

$$
\mathfrak{E}^{\mathrm{fail}}_\Gamma
\coloneqq
\mu I.\;
\Gamma
\to
\operatorname{Either}
\left(
\Xi,
\Gamma\times(\Gamma\to\Gamma)\times\operatorname{Maybe}(I)
\right).
$$

Witnessed form:

$$
\begin{aligned}
\mathfrak{E}^{\mathrm{fail}*}_\Gamma
\coloneqq
\mu I.\;&
(e:\Gamma\to\operatorname{Either}(\Xi,\Gamma\times(\Gamma\to\Gamma)\times\operatorname{Maybe}(I)))\\
&\times
\left(
(\gamma:\Gamma)
\to
\left(
\mathbf{let}\;\mathrm{Right}(\delta,g,o)=e(\gamma)\;\mathbf{in}\;g(\delta)\simeq\gamma
\right)
\right).
\end{aligned}
\tag{49}
$$

A failure has no new effect to undo, but all successful earlier iterations still have accumulated inverses. The lifecycle enters unloading and recovers them.

This is transactional activation rather than a simple `try/catch` convention.

---

# 4.4 Metatheory — pp.38–53

The metatheory is where the paper moves from plausible runtime rules to formal system guarantees.

## Trace decomposition

### Equation (50): indexed step

$$
\operatorname{step}_t
\coloneqq
r(n).
\tag{50}
$$

### Equation (51): state transformation of a step

$$
\Psi_t
\coloneqq
\begin{cases}
\operatorname{pr}_1\circ i,
&\text{at L-Iter, L-Finish, landing L-Divert},\\
 g,
&\text{at L-Unload},\\
\operatorname{id}_\Gamma,
&\text{otherwise}.
\end{cases}
\tag{51}
$$

### Equation (52): factorization into effect + control edit

$$
\boxed{
\gamma_{t+1}
=
\operatorname{edit}_t(\Psi_t(\gamma_t))
}
\tag{52}
$$

This separates semantic state transformation from lifecycle bookkeeping.

### Equation (53): operational equivalence

The calculus enriches observational equivalence with agreement on relevant registry/control fields:

$$
\begin{aligned}
\gamma\simeq\delta
\iff
a&\sigma_\gamma\simeq\sigma_\delta\\
&\land\operatorname{dom}(F_\gamma)=\operatorname{dom}(F_\delta)\\
&\land\forall n,
\forall c\in\{\theta,\tau,\pi,d,p,e\}:\;
 c(\gamma(n))\simeq_c c(\delta(n)).
\end{aligned}
\tag{53}
$$

The paper also uses a weaker $\approx$ in recovery arguments that forgets some control bookkeeping while preserving actual observable effects.

## 4.4.1 Preservation

Definition 58 defines a well-formed registry. The key invariants include:

- every parent points to an existing fiber or root;
- distinct fibers' provisions are disjoint in the base shared realm;
- an installed fiber's committed view is total on its declared dependencies and points to existing fibers;
- every provider named by an installed fiber's committed view is itself installed.

**Theorem 59 (Preservation)** proves that every operational rule preserves well-formedness.

This is the safety floor for all later global theorems.

## 4.4.2 Temporal composability

### Equation (54): reachable iterator transformations

$$
\operatorname{reach}(i)
\coloneqq
\bigcap
\left\{
S
\mid
i\in S
\land
\forall i'\in S,\gamma\in\Gamma:
 i'(\gamma)=(-,-,\mathrm{Just}(i''))
\Rightarrow i''\in S
\right\},
$$

$$
\mathfrak{M}(i)
\coloneqq
\left\langle
\{\operatorname{pr}_1\circ i'\mid i'\in\operatorname{reach}(i)\}
\cup
\{\operatorname{pr}_2(i'(\gamma))\mid i'\in\operatorname{reach}(i),\gamma\in\Gamma\}
\right\rangle.
\tag{54}
$$

### Equation (55): iterator independence

$$
\forall f\in\mathfrak{M}(i),
\forall g\in\mathfrak{M}(j):
\quad
f\circ g\simeq g\circ f,
$$

and

$$
\forall i'\in\operatorname{reach}(i),
\forall g\in\mathfrak{M}(j),
\forall\gamma\in\Gamma:
\quad
\operatorname{pr}_{2,3}(i'(g(\gamma)))
\simeq
\operatorname{pr}_{2,3}(i'(\gamma)),
\tag{55}
$$

plus the symmetric condition.

### Equation (56): Theorem 61 — recovery exactness

$$
\boxed{
 g_n^{u}(\gamma_u)
\approx
(\Psi_{t_\ell}\circ\cdots\circ\Psi_{t_1})(\gamma_b)
}
\tag{56}
$$

The $t_i$ are exactly the steps taken by **other fibers** during fiber $n$'s episode.

Interpretation: applying $n$'s accumulated inverse removes $n$'s own contribution and leaves the effects of independent concurrent/interleaved fibers as if $n$ had not contributed.

### Equation (57): terminal recovery

$$
\boxed{
\gamma_{u+1}
\approx
(\Psi_{t_\ell}\circ\cdots\circ\Psi_{t_1})(\gamma_b)
}
\tag{57}
$$

Once the episode closes, the departing fiber leaves no residual observable contribution.

This is the global form of temporal composability.

## 4.4.3 Spatial composability

### Equation (58): Theorem 63 — ordering

$$
\operatorname{step}_t=L\text{-}\operatorname{Begin}(m)
\Longrightarrow
\gamma_t\models d_m.
\tag{58}
$$

The full theorem additionally shows that if consumer $m$ committed key $k$ to provider $n$, then:

- the provider's activation episode begins before the consumer's;
- the consumer's episode ends before the provider's can finish unloading;
- the provider's binding remains stable and readable to the consumer during that episode.

This gives the desired nested lifetime relation:

```text
provider ACTIVE
    └── consumer ACTIVE
        └── consumer UNLOADING
    provider still readable here
provider UNLOADING / inverse only after consumer exits
```

### Equation (59): Theorem 64 — resolution coherence

$$
\forall t\in[b,r]:
\quad
\operatorname{step}_t
\in
\{L\text{-}\operatorname{Iter}(n),L\text{-}\operatorname{Finish}(n)\}
\Longrightarrow
\operatorname{target}^{t}_n=\omega.
\tag{59}
$$

A transition runs against one committed provider resolution. If the target changes mid-transition, the transition cannot silently finish against a mixture of old and new dependencies; it either finishes consistently or diverts and then rolls back.

This is the global form of spatial composability.

## 4.4.4 Progress

### Equation (60): precedence relation

$$
\boxed{
 n\prec m
\iff
p_n\cap d_m\neq\varnothing
}
\tag{60}
$$

This says $n$ may provide something $m$ requires.

The progress proof assumes $\prec$ is acyclic.

### Equation (61): target-turn count

$$
V(n)
\coloneqq
\left|
\{t:\operatorname{target}^{t}_n\neq\operatorname{target}^{t+1}_n\}
\right|.
\tag{61}
$$

**Theorem 66 (Progress)** establishes:

1. no deadlock in a non-quiescent state — some lifecycle rule is applicable;
2. termination under finite names and bounded iterator length $K$:

$$
\boxed{
S(n)\le(K+4)(V(n)+1)
}
$$

with finite total lifecycle work.

This is important because the provider-drain guard from Section 4.3.1 could otherwise appear capable of deadlock. Acyclic dependency precedence ensures the chain eventually bottoms out.

## 4.4.5 Confluence

### Equation (62): support relation

$$
 m\triangleleft n
\iff
m\prec n\lor\pi_n=m.
\tag{62}
$$

This combines dependency support and parent-child support.

### Equation (63): support set

$$
\boxed{
 n\in A
\iff
\neg\tau_n
\land
(\pi_n=\mathrm{root}\lor\pi_n\in A)
\land
\forall k\in d_n:\exists m\in A:\;k\in p_m
}
\tag{63}
$$

A fiber is supported if it is not retired, its parent is supported, and every required key has a supported provider.

Lemma 68 proves support is well-founded under the acyclicity conditions.

Definition 69 adds **totality on provision**: when activation finishes successfully, the component actually installs all keys it declared in $p$.

### Equation (64): support at quiescence

$$
\boxed{
A
=
\{n:\theta_n=\mathrm{Active}(-,-)\}
}
\tag{64}
$$

at a nonfailed quiescent state under the stated conditions.

Lemmas 71 and 72 provide transposition/deletion results used to normalize traces.

**Theorem 73 (Confluence)** is the system-level climax. Informally:

$$
\boxed{
\text{dynamic history}
\rightsquigarrow
\text{same quiescent observable state as canonical from-scratch assembly}
}
$$

for the same orchestration inputs, modulo permitted renaming/equivalence.

This means valid intermediate activation/reload/unload schedules do not determine the final semantics. The final composition does.

For a self-modifying runtime this is exactly the property one wants: a history of experimentation should not permanently contaminate the final state.

---

# 5. Implementation and Case Study — pp.54–66

# 5.1 Cordis core library

Cordis maps the theory almost literally into runtime abstractions.

Important correspondences include:

| Theory | Cordis runtime |
|---|---|
| $\Gamma_\infty$ | `ctx` |
| $\mathfrak{E}_\Gamma$ / iterator effects | callbacks yielding inverses |
| `effect` lifting | `ctx.effect(callback)` |
| $\Sigma$ | context store |
| `get/set` | `ctx.get`, `ctx.set` |
| isolation | `ctx.isolate` |
| interception | `ctx.intercept` |
| component instance | `fiber` |
| requirements $d$ | `fiber.inject` |
| provisions $p$ | component `provide` |
| activation effect $e$ | `fiber.apply` |
| parent $\pi$ | `fiber.parent` |
| lifecycle $\theta$ | `fiber.state` |
| accumulator $g$ | `fiber.dispose` |
| committed view $\omega$ | `fiber.committed` |
| target | `fiber.target` |

## 5.1.1 Effect tracking — Algorithm 1

The practical API uses `ctx.effect` as the single mutation primitive. Effect callbacks yield inverse closures; the runtime composes them into one disposer.

Conceptually:

```text
inverse = identity
for each successful effect step:
    inverse = yieldedInverse ∘ inverse
return inverse
```

The `armed` guard makes disposal idempotent and stops further effect iteration. Child disposers are also composed into parent contexts, implementing the recursive effect context.

A crucial limitation is explicit: the implementation **does not mechanically prove** that the supplied inverse is correct. The theory requires a witness; TypeScript trusts component authors for that local obligation.

This distinction matters for ACRYL. Structural tracking can be enforced; semantic correctness of arbitrary user-supplied inverse code cannot generally be automatically proven.

## 5.1.2 Coeffect operations — Algorithms 2 and 3

Cordis stores:

- value store;
- realm/isolation table;
- interception metadata.

`ctx.set` itself is implemented through `ctx.effect`, so provision is automatically reversible.

Notification scans live fibers affected by changed keys and calls `refresh` only when the key and realm match the dependent's declared injection.

One subtle design: a provider in `UNLOADING` stops counting as available **before** its bindings are physically removed. This causes dependents to start teardown while still letting their committed view access the old binding.

That is the implementation of Theorem 63.

## 5.1.3 Component lifecycle — Algorithms 4 and 5

`ctx.use(component, config)` creates a fiber and itself becomes a tracked effect of the parent. Parent removal therefore cascades naturally into child retirement.

`refresh(fiber)` recomputes the target provider view and starts `reload` or `unload` only if no transition is already in flight.

`reload`:

1. snapshots the target;
2. commits the provider resolution;
3. executes the component's effect iterator;
4. accumulates recovery;
5. becomes ACTIVE if target remained unchanged;
6. otherwise chains immediately into unload.

`unload`:

1. notifies/drains dependents;
2. waits for them to reach inactive state;
3. executes the accumulated disposer;
4. clears committed view;
5. becomes INACTIVE if target is still absent;
6. otherwise chains immediately into reload.

This mutual chaining realizes the paper's inertial async semantics.

The target stores **provider identity**, not just values. Therefore replacing a provider with another instance triggers dependent reload even if the new provider happens to expose an equal-looking value.

## 5.1.4 Context access — Algorithm 6

Cordis layers property access on top of reflective `ctx.get` through a JavaScript `Proxy`.

Resolution walks the fiber-parent chain:

- if the key exists in the committed view, access is allowed;
- if the fiber declared it but has no committed binding, access fails as inactive;
- if no declaration exists by the root, access fails as undeclared.

This is both dependency enforcement and the basis of a capability-like security model.

# 5.2 Component loader

The core library is imperative. The component loader adds **declarative desired state**.

## 5.2.1 Declarative configuration

Definition 74 gives an entry fields such as stable `id`, module `url`, `isolate`, `intercept`, `config`, and `disabled`.

The configuration tree becomes the authoritative description of desired composition. Reconciliation maps changes to the least disruptive fiber operation.

Examples:

- `url` change → rebuild component;
- `disabled` → unload/reload;
- interception metadata → update in place;
- isolation → realm reassignment;
- config → component-specific update/diff.

The paper connects reconciliation soundness directly to metatheory:

- confluence says final quiescent state depends on final configuration, not transition order;
- progress says reconciliation completes;
- recovery says departing entries leave no residue;
- spatial ordering means loader need not manually topologically serialize module fetching/instantiation.

### Equation (65): delimiter property for movable isolation scopes

$$
\gamma'[\delta_k]=d_1
\iff
\gamma'\text{ is derived from the entry's context}.
\tag{65}
$$

The loader uses fresh delimiter tags to decide whether a binding belongs to a moving isolation scope and therefore needs to migrate with it.

## 5.2.2 Hot Module Replacement — Algorithms 8–10

Cordis HMR proceeds in three phases.

### Algorithm 8: module classification

Changed modules are seeded as accepted; known external/unreplaceable modules are declined. Dependencies are expanded to a fixed point. Cycles that cannot be safely classified default to declined.

### Algorithm 9: stale-entry detection

For each component entry, the loader walks its transitive dependency tree up to declined boundaries. An entry is stale if its dependency closure intersects the accepted changed modules.

### Algorithm 10: transactional module reload

The runtime:

1. invalidates relevant module caches while preserving backups;
2. disposes old fibers;
3. imports and instantiates new versions;
4. if any import fails, restores caches and reinstantiates the old versions.

So HMR itself is transactional at the module-fiber level.

Unlike conventional HMR acceptance boundaries written by application developers, Cordis can use fiber boundaries because every component's effects are already bounded and reversible through the context.

# 5.3 Koishi case study

Koishi is presented as evidence that the abstraction works in a real, open plugin ecosystem with 4000+ community plugins.

The case study supports two claims:

1. **expressiveness** — full applications can be built from these primitives;
2. **generality** — the same composition model supports both server-side bot functionality and browser-console plugins.

Temporal composability is demonstrated by disabling/reloading plugins while preserving unrelated live state such as connections and caches.

Spatial composability is demonstrated by real plugin dependency topology: adapters and database drivers provide capabilities consumed by independent plugins; unavailable dependencies leave consumers inactive rather than crashing them.

The authors are careful about validity: this is one TypeScript ecosystem and observational evidence, not a controlled performance/productivity comparison.

---

# 6. Discussion — pp.67–73

This section contains several of the most practically important caveats for ACRYL.

# 6.1 System boundary

Not every real-world action has a true inverse. The theory's $\Gamma$ is bounded by what the runtime can exclusively control and restore.

The paper distinguishes **acquisition** and **emission**.

Examples of acquisition:

```text
open → file descriptor
malloc → allocated block
fork → child process
```

The acquired handle can often be tracked and later released.

Examples of emission:

```text
write bytes to an externally observed file
send network datagram
charge payment
send email/message
```

Once information has crossed the boundary, a true inverse may not exist.

The paper gives two strategies:

- **withholding** — delay external emission until the local state is committed;
- **compensation** — perform another action that restores application-level equivalence, e.g. delete a created object or refund a charge.

This is a critical limit: Cordis-like temporal composability is not magic rollback of the external world.

# 6.2 Service multiplexing

The paper explores multiple providers for a logical service.

### Exclusive binding

Only one provider is bound at a time. Switching provider identity perturbs dependents and causes reload.

### Service broker

A stable broker remains the dependency exposed to consumers while multiple backing providers come and go behind it.

This enables:

- load balancing;
- rolling updates;
- cross-process invocation.

Rolling update becomes application-level provider composition: add new provider, wait until ACTIVE, shift traffic, drain old provider, unload it.

Cross-process providers can preserve the same interface over RPC, but such interfaces should be asynchronous because remote calls may block or fail.

For ACRYL this is directly useful for model/provider multiplexing, memory backends, tool executors, sandboxes and agent pools.

# 6.3 Access control and sandboxing

Dependency declarations form a capability-like access model: a component can access only the keys it declared.

Interception metadata can further attenuate a capability, for example:

```text
filesystem capability
+ context metadata { read: /repo, write: none }
```

The provider need not be modified; policy is supplied by the context.

However, the paper explicitly states that language-level mediation is **not a sandbox against malicious code**. If untrusted code can reach host objects directly, it can bypass the context. Real isolation requires a stronger boundary such as:

- software fault isolation;
- separate language runtime;
- separate sandboxed process;
- VM/container/WebAssembly-style boundary.

For ACRYL this strongly argues for two layers:

```text
capability context = policy/authority model
sandbox boundary   = enforcement against hostile code
```

# 6.4 Language independence and selection

The paradigm is language-agnostic but has practical requirements.

Temporal composability needs closures or equivalent first-class values so inverses can capture restoration state. It also needs some form of runtime code introduction/retraction.

The paper surveys:

- module registries/GC in managed runtimes;
- dynamic linking/unlinking for native code;
- host-controlled lifecycle for WebAssembly.

Spatial composability needs:

- typed dependency declarations;
- dynamically mediated access.

Examples of type-side mechanisms include traits/typeclasses/module augmentation. Runtime mediation may use proxies, descriptors, reflection or generated accessors/macros.

This is relevant to ACRYL because the core concept does **not** require TypeScript, even though Cordis is TypeScript.

# 6.5 Mutual dependencies and component granularity

A dependency cycle in the reactive model leaves the components permanently unsatisfied/inactive. Unlike a schedule-dependent concurrency deadlock, this can be detected from declarations.

The authors recommend factoring bidirectional interactions into smaller core and integration components.

Example:

```text
server-core
access-control-core
request-mediation(server-core + access-control-core)
policy-management(server-core + access-control-core)
```

instead of making server and access controller depend directly on each other.

The trade-off is component explosion. With $n$ mutually interacting components, integration bindings can grow quadratically in the worst case.

The paper suggests reducing authoring overhead through:

- package bundling;
- convention-based wiring;
- generated/scaffolded integration components.

For ACRYL, this suggests keeping the runtime model fine-grained while the product UI/package model can remain coarser.

# 6.6 Dependency typing and versioning

This subsection exposes a real limitation in the formal model.

A key identity alone does not solve independently versioned plugin ecosystems.

Two failure classes:

### Interface drift

Same key, provider changes interface or behavioral contract.

### Key collision

Unrelated providers independently choose the same key name.

The paper discusses three strategies.

#### Namespacing

Extend key identity conceptually from $K$ to something like $K\times P$, where $P$ identifies the defining package.

#### Peer dependencies

Use the host package manager to enforce compatible versions. Cordis currently takes this route.

#### Structural compatibility

Replace mere key membership with a compatibility predicate saying the provided interface structurally satisfies the consumer's expected interface.

The paper notes that structural records are relatively straightforward, but behavioral contracts, effects and polymorphism make full language-independent compatibility much harder or undecidable.

This is highly relevant to ACRYL: a public capability protocol should not rely on a bare string key.

# 6.7 Co-design with languages and operating systems

A language designed for the context paradigm could make context implicit while preserving its semantics, preventing accidental capture/use of another component's context.

It could also compile effect iterators into efficient state machines and make coeffect declarations part of the type system, enabling compile-time cycle detection and structural compatibility checks.

An operating system co-designed with the paradigm could make declared dependencies the **entire reachable authority** of a component, closer to how a WebAssembly module receives explicit imports.

The OS could also make more resources natively revertible: transactional storage, copy-on-write state, kernel-tracked resource acquisition, etc.

---

# 7. Related Work — pp.74–79

This section is important because it clarifies what the authors claim is genuinely different.

# 7.1 Effect and coeffect systems

The paper compares Cordis with typed effect libraries such as ZIO and Effect-TS. Those systems encode computations inside an effect type and track requirements/errors statically or through interpretation.

Cordis differs in two principal ways:

1. tracking is an overlay on ordinary host-language code rather than requiring all application logic to live inside a monadic effect value;
2. withdrawal re-runs explicit inverses and re-resolves providers, rather than merely changing an interpreter/service environment while prior effects remain.

The paper also compares reversible effect semantics. Prior reversible-computing work often requires stronger global invertibility. Cordis requires less: each atomic context effect supplies a one-sided inverse at the state where it was applied.

Graded effect/coeffect systems unify the two ideas statically. Cordis's contribution is runtime reification for changing component sets.

# 7.2 Programming paradigms

The authors compare the context paradigm with **context-oriented programming** and **aspect-oriented programming**.

Context-oriented programming can activate behavioral layers based on ambient context but does not automatically track/revert side effects or bind activation to dependency satisfaction.

Aspect-oriented programming can intercept cross-cutting operations but typically does not provide the unified effect-recovery + reactive-dependency semantics of Cordis.

Cordis's context is not merely ambient situation; it is the mediated carrier of both what components do and what they require.

# 7.3 Temporal composability

The paper groups prior approaches into several families.

### Lifecycle callbacks

Common plugin/component frameworks offer activate/deactivate or mount/unmount hooks. Cleanup is hand-written and therefore incomplete cleanup remains possible.

### Framework-owned registration/disposal APIs

Some frameworks return disposable handles for registrations. This improves locality but still works only for host-defined resources and does not automatically aggregate arbitrary component effects into one structural rollback path.

### Static-scope reversal

Transactions, reversible computing, RAII, linear types and ownership systems provide powerful recovery guarantees, but generally tie reversal to a statically determined scope or a globally reversible semantic model.

### Interposed reclamation

Systems research such as kernel extension recovery tracks resource acquisition at a runtime-controlled boundary and reclaims it after failure. The paper sees this as the closest systems-level precedent to revertible effects, but Cordis allows components to introduce their own effect vocabulary by supplying inverses.

# 7.4 Spatial composability

### Initialization-time dependency injection

Spring, Guice, Angular DI, React/Vue context and similar systems wire dependencies at initialization. They generally do not treat provider removal/replacement as a full asynchronous component lifecycle transition.

### Availability-reactive component systems

OSGi Declarative Services and iPOJO are close precedents. They can activate/deactivate components as services appear/disappear.

The paper claims Cordis advances this in two directions:

- deactivation cleanup is structurally derived from accumulated inverses rather than only handwritten callbacks;
- asynchronous teardown and provider draining are modeled explicitly.

### Value-level reactive systems

FRP/signals propagate individual value changes. Cordis operates at component granularity and provides asynchronous lifecycle semantics.

The authors do **not** claim the two compete. A coeffect value can itself be reactive, combining component-level lifecycle with value-level signals.

---

# 8. Conclusion — p.79

The conclusion restates the paper's central construction:

```text
revertible effects
        +
reactive coeffects
        ↓
unified context
        ↓
component + fiber calculus
        ↓
global recovery + dependency ordering + progress + confluence
        ↓
Cordis implementation
```

The authors explicitly identify **self-evolving agent harnesses** as an important future validation target: frequent AI-generated replacement of harness components would stress exactly the temporal and spatial guarantees developed by the paper.

The references occupy pp.80–88. They contain the bibliography rather than additional argumentative sections; the relevant research families are analyzed in Section 7 above.

---

# 9. Complete numbered-equation index (1)–(65)

This section is a compact reference to the formulas reconstructed above.

| Eq. | Core object | Meaning |
|---:|---|---|
| (1) | $\Gamma\vdash t:T^{\mathrm{effect}}$ | effect-annotated typing judgment |
| (2) | effect handler form | algebraic effect handler |
| (3) | $\Gamma^{\mathrm{coeffect}}\vdash t:T$ | coeffect-annotated context |
| (4) | $(f_1,g_1)\circ(f_2,g_2)$ | twisted forward/inverse composition |
| (5) | $\partial\Gamma$ | effect context + accumulator |
| (6) | `track` | apply effect and accumulate inverse |
| (7) | projection law | tracking preserves forward semantics |
| (8) | homomorphism law | tracking preserves composition |
| (9) | `recover` | execute accumulator and reset |
| (10) | recovery invariance | one tracked effect preserves recovery result |
| (11) | sequence recovery | arbitrary tracked sequence recovers |
| (12) | $\mathfrak E_\Gamma,\mathfrak E_\Gamma^*$ | effect function + witness |
| (13) | $\diamond$ | composition of state-dependent inverse effects |
| (14) | `effect` lifting | lift effect into tracked context |
| (15) | lifting homomorphism | lifted effect preserves $\diamond$ |
| (16) | lifted inverse | exact state recovery at next level |
| (17) | $\mathfrak M(e)$ | transformation monoid of an effect |
| (18) | commutation | first independence condition |
| (19) | inverse stability | second independence condition |
| (20) | $\Sigma$ | typed partial dependency map |
| (21) | `get/set` | dependency access/provision |
| (22) | coeffect operation | value mutation + inverse + result |
| (23) | lifted operation | operate on one key in whole context |
| (24) | $\sigma\models d$ | dependency satisfaction |
| (25) | $\mathfrak D_\Sigma$ | dependency specification set |
| (26) | `notify` | activating/deactivating/neutral classification |
| (27) | $\Sigma_{iso}$ | isolation realms |
| (28) | isolation ops | get/set/isolate through realm indirection |
| (29) | $\Sigma_{inter}$ | interception metadata/provider functions |
| (30) | interception ops | metadata-mediated capability access |
| (31) | $\Gamma_\infty$ | recursive unified context |
| (32) | $\simeq$ | observational equivalence |
| (33) | respects $\simeq$ | context map descends to quotient |
| (34) | map/pair equivalence | equivalence of transformations/results |
| (35) | operation outcome independence | other ops do not perturb result |
| (36) | coeffect-mediated effects | outcome-dependent effect sequencing |
| (37) | $\mathfrak C_\Gamma$ | component = requirements × provisions × effects |
| (38) | base $\Theta_\Gamma$ | inactive/active lifecycle |
| (39) | $F_\gamma$ | fiber registry |
| (40) | $\sigma_\gamma$ | dependency table derived from active fibers |
| (41) | `target` | desired provider identity view |
| (42) | base `quiet` | lifecycle matches target |
| (43) | richer $\Theta_\Gamma$ | inactive/reloading/active/unloading |
| (44) | installed/failed | lifecycle predicates |
| (45) | richer `quiet` | quiescence with transition/failure states |
| (46) | `relied` | whether consumers still hold provider |
| (47) | effect iterator | multi-stage activation with inverses |
| (48) | iterator lifting | recursive tracked iteration |
| (49) | failure iterator | activation step may raise |
| (50) | `step_t` | indexed operational step |
| (51) | $\Psi_t$ | semantic state transformation of step |
| (52) | state factorization | semantic transform + control edit |
| (53) | operational $\simeq$ | equivalence including registry control fields |
| (54) | `reach`, $\mathfrak M(i)$ | iterator transformation closure |
| (55) | iterator independence | global interleaving independence |
| (56) | recovery exactness | remove one fiber, retain others |
| (57) | terminal recovery | closed fiber episode leaves no trace |
| (58) | begin ordering | activation only with satisfied deps |
| (59) | resolution coherence | transition sees one committed provider view |
| (60) | $\prec$ | provider-before-consumer precedence |
| (61) | $V(n)$ | number of target changes |
| (62) | $\triangleleft$ | support via dependency or parenthood |
| (63) | $A$ | recursively supported fibers |
| (64) | support = active | quiescent active set characterization |
| (65) | delimiter property | managed isolation ancestry test |

---

# 10. Main formal results and what each buys

| Result | What it establishes | Runtime consequence |
|---|---|---|
| Theorem 5 | `track` preserves composition | inverse bookkeeping can be layered transparently |
| Theorem 7 | tracked effect preserves recovery result | local rollback invariant |
| Theorem 10 | effect functions form a monoid | arbitrary atomic effects compose |
| Theorem 11 | witnessing survives composition | composite effect remains revertible |
| Theorem 13 | effect lifting preserves composition | nested contexts behave compositionally |
| Theorem 16 | LIFO sequence can be selectively reverted | component teardown from accumulated inverses |
| Theorem 20 | independent effect can be removed after interleaving | unrelated effects survive component removal |
| Corollary 21 | inverses can be applied in any permutation under independence | independent component unload order |
| Theorem 40 | distinct-key operations are independent | fine-grained capability keys naturally commute |
| Theorem 42 | suitable coeffect-mediated effects are independent | context discipline supplies temporal independence |
| Theorem 59 | operational rules preserve well-formedness | runtime does not corrupt dependency/lifecycle invariants |
| Theorem 61 | recovery exactness | fiber removal preserves other fibers' work |
| Corollary 62 | terminal recovery | unloaded fiber leaves no observable residue |
| Theorem 63 | provider/consumer ordering | dependents drain before provider inverse runs |
| Theorem 64 | resolution coherence | no activation mixes provider versions |
| Theorem 66 | progress + termination | reconciliation reaches quiescence under assumptions |
| Lemma 70 | supported set equals active set at quiescence | desired support predicts runtime activity |
| Theorem 73 | confluence/canonical form | final state depends on final composition, not valid schedule |

---

# 11. Algorithms 1–10 — implementation map

| Algorithm | Purpose | ACRYL analogue |
|---:|---|---|
| 1 | effect tracking / composed disposer | universal effect ledger + rollback stack |
| 2 | coeffect `get/set` | capability registry publication |
| 3 | reactive notification | dependency graph refresh |
| 4 | component instantiation | spawn live plugin/service/agent-adapter fiber |
| 5 | component lifecycle | reconciler state machine |
| 6 | proxy-mediated context access | capability enforcement at point of use |
| 7 | isolation realm reassignment | move workspace/session/account scope safely |
| 8 | HMR module classification | decide hot-replaceable change closure |
| 9 | stale entry detection | determine affected live components |
| 10 | transactional module reload | replace code with rollback to old module on failure |

---

# 12. ACRYL: direct architectural extraction

The paper suggests a much cleaner ACRYL kernel boundary than putting agent integrations directly into the product core.

## 12.1 Proposed ACRYL component contract

From Eq. (37):

$$
\mathfrak C_\Gamma
=
\mathfrak D_\Gamma
\times
\mathfrak P_\Gamma
\times
\mathfrak E^*_\Gamma.
$$

Translate this literally:

```yaml
component:
  id: memory.hindsight

  requires:
    - workspace.fs@1
    - persistence.sqlite@1

  provides:
    - memory.semantic@1

  apply:
    - open database
    - start indexer
    - register memory provider

  # each atomic mutation yields its own disposer/inverse
```

The runtime should not accept a component as merely `start()` / `stop()`. It should mediate its environmental effects so teardown is **derived from setup**.

## 12.2 ACRYL context should be the persistent scene

The strongest translation of Eq. (31) is:

```text
ACRYL Context
├── current hierarchical context
├── rollback accumulator(s)
├── capability/provider environment
├── session/task state
├── workspace identity
├── permissions/policies
└── child component/fiber contexts
```

This gives a formal version of the ACRYL intuition:

> The scene persists. The actors/providers can change.

## 12.3 Agent handoff as provider replacement

Define capabilities such as:

```text
agent.execution@1
agent.streaming@1
agent.tool-use@1
agent.context-import@1
agent.context-export@1
```

A session component depends on them. The committed view $\omega$ records which live agent fiber provides each capability.

Then:

```text
Claude provider → UNLOADING
new targets no longer resolve Claude
consumer transitions/drains
Codex provider → ACTIVE
consumer target changes to Codex
consumer reloads against one coherent new view
```

This is far more principled than embedding named-agent conditionals throughout ACRYL.

## 12.4 Memory systems as replaceable providers

Possible capability:

```text
memory.semantic@1
```

Providers:

```text
Hindsight
Supermemory
OpenViking
Mem0
Honcho
```

Consumers depend only on the capability. Provider identity is part of the target view, so replacing Hindsight with Supermemory becomes an explicit lifecycle transition rather than a hidden mutable singleton switch.

## 12.5 Code/context graph systems as providers

Likewise:

```text
graph.code@1
graph.query@1
graph.impact@1
```

can be provided by OmniGraph, lat.md or another graph engine. The paper's isolation mechanism can scope the same logical graph key differently per workspace/session.

## 12.6 Self-generated extensions

The paper is particularly strong for Pi-style self-extension.

Instead of:

```text
agent edits host application
→ restart
→ hope it works
```

use:

```text
agent synthesizes component
→ instantiate as LOADING fiber
→ each setup step yields inverse
→ dependencies remain coherent
→ if target stays valid and setup finishes: ACTIVE
→ otherwise: UNLOADING → rollback
```

This makes self-modification a **transactional experiment**.

## 12.7 Continuous Mode = reconciliation, not immortality

A useful reinterpretation of ACRYL Continuous Mode is:

```text
persistent context + continuously reconciled replaceable components
```

not:

```text
one giant process/object graph that must never restart internally
```

The Cordis model says that continuity belongs to the **context and desired composition**, while individual fibers are expected to come and go.

## 12.8 Effect classes for ACRYL

The paper's system-boundary discussion implies ACRYL should explicitly classify effects.

### Reversible

```text
register local command
enable local tool
start subprocess
add filesystem watcher
open private temporary resource
mount local UI contribution
```

### Compensatable

```text
create remote issue       → close/delete if API permits
create cloud resource     → destroy it
push reversible config    → push compensating revision
```

### Irreversible / externally emitted

```text
send email
post Slack message
publish package
transfer money
send externally observed network message
```

An ACRYL self-evolution transaction should preferably withhold irreversible emissions until the local composition has committed.

## 12.9 Capabilities + interception = policy plane

Interception can encode ACRYL policy without modifying providers:

```yaml
capability: workspace.fs@1
policy:
  read:
    - /repo/**
  write:
    - /repo/src/**
  deny:
    - /repo/.env
```

or:

```yaml
capability: shell.exec@1
policy:
  commands:
    allow: [git, npm, pnpm, cargo]
```

But following Section 6.3, this is not enough for hostile/untrusted code. ACRYL still needs a real sandbox boundary for generated components.

## 12.10 Capability IDs need more than strings

Section 6.6 is a warning for ACRYL's protocol design.

A robust key should encode at least namespace and version/contract identity, for example:

```text
acryl://core/memory.semantic/v1
acryl://core/agent.execution/v2
acryl://omnigraph/code.graph/v1
```

Potential descriptor:

```yaml
capability: acryl://core/memory.semantic/v1
interface_hash: sha256:...
version: 1.3.0
contract:
  methods:
    - search(query, scope) -> Result[]
    - remember(record) -> RecordId
```

Ultimately ACRYL may want a structural compatibility check, not just nominal key matching.

## 12.11 Dependency cycles should be first-class diagnostics

From Eq. (60):

$$
n\prec m
\iff
p_n\cap d_m\neq\varnothing.
$$

ACRYL should construct this graph before activation and detect cycles.

Instead of letting two plugins silently remain inactive, the UI can explain:

```text
Cannot activate:
  session-ui → needs session.controller
  session-controller → needs session-ui

Suggested decomposition:
  session-core
  session-ui-binding
  session-controller-binding
```

## 12.12 Service brokers for multi-provider ACRYL capabilities

Not every capability should use exclusive binding.

Examples for broker-style capabilities:

```text
model.inference
agent.worker
retrieval.search
memory.write
sandbox.executor
```

A stable broker can survive backing-provider rolling updates, avoiding reload of every consumer whenever one worker changes.

---

# 13. What I would adopt from the paper for ACRYL now

## Adopt directly

### 1. Effect ledger / inverse-first mutation API

Every mutation that ACRYL itself performs should return/register its disposer locally.

```ts
const dispose = ctx.effect(() => {
  const handle = registerTool(tool)
  return () => unregisterTool(handle)
})
```

The exact API can differ, but the invariant matters more than syntax.

### 2. Capability declarations

Every component gets explicit `requires` and `provides`.

### 3. Provider identity in target state

Do not compare only values. Track which provider instance a consumer committed against.

### 4. Four-state lifecycle

At minimum:

```text
INACTIVE
LOADING
ACTIVE
UNLOADING
```

plus failure outcome.

### 5. Drain dependents before provider recovery

This should be a kernel-level rule, not an ad-hoc callback convention.

### 6. Iterated setup with rollback checkpoints

Generated/self-modifying extensions especially need stepwise activation.

### 7. Desired-state reconciliation

The orchestrator changes configuration; the runtime derives lifecycle transitions.

### 8. Transactional HMR/self-update

Keep old component/code available until new version has successfully instantiated.

### 9. Context realms

Use them for workspaces, rooms, accounts, user sessions and experiment sandboxes.

### 10. Interception metadata

Use it as a generic policy/capability attenuation mechanism.

---

# 14. What I would *not* copy blindly

## 14.1 Do not assume every effect is invertible

The paper itself does not. ACRYL must model external emissions separately.

## 14.2 Do not make bare key equality the public compatibility protocol

Section 6.6 explicitly identifies this as insufficient.

## 14.3 Do not interpret context-level capability access as a security sandbox

The paper explicitly warns against this.

## 14.4 Do not force the entire ACRYL application into Cordis before prototyping

The useful ideas are separable from the exact TypeScript implementation.

A reasonable experiment is a small composition kernel with:

```text
ctx.effect
ctx.provide
ctx.resolve
ctx.isolate
ctx.intercept
fiber lifecycle
reconciler
```

and then run real ACRYL providers through it.

## 14.5 Do not ignore independence assumptions

The strongest temporal theorem depends on interleaved effects commuting up to observational equivalence. Real effects on the same ordered/global state may not.

ACRYL should therefore prefer **fine-grained capability/state ownership** rather than many components mutating one global bag.

---

# 15. Recommended ACRYL experiment derived from the paper

Build a minimal `acryl-compose` kernel and validate it with four hot-swappable provider classes.

```text
Persistent ACRYL Context
│
├── workspace.fs
│
├── agent.execution
│   ├── OpenCodeProvider
│   └── PiProvider
│
├── memory.semantic
│   ├── HindsightProvider
│   └── SupermemoryProvider
│
└── graph.code
    ├── OmniGraphProvider
    └── LatProvider
```

Test scenarios:

```text
1. load provider
2. start consumer
3. replace provider while consumer active
4. verify consumer drains before old provider disappears
5. inject failure halfway through new provider activation
6. verify old provider/context can be restored
7. mutate two independent providers concurrently
8. unload one and verify the other's state remains
9. isolate same capability into two workspaces
10. apply permission interception to one realm only
```

Success criteria directly mirror the paper:

$$
\text{temporal:}
\quad
\text{remove}(A)
\approx
\text{history with }A\text{ omitted}
$$

$$
\text{spatial:}
\quad
\text{consumer transition sees one stable provider view}
$$

$$
\text{progress:}
\quad
\text{reconciliation reaches quiescence}
$$

$$
\text{confluence:}
\quad
\text{same desired final composition}
\Rightarrow
\text{same observable quiescent state}.
$$

---

# 16. Final assessment for ACRYL

The most important insight is **not** merely "everything is a plugin." Many frameworks already say that.

The stronger idea is:

> **Every component declares what it needs, what it provides, and how every environmental mutation can be withdrawn; the runtime owns the composition semantics.**

That moves ACRYL from a collection of adapters and lifecycle callbacks toward a genuine **live composition runtime**.

In compressed form:

$$
\boxed{
\begin{aligned}
\text{Component}
&=
\text{Requirements}
\times
\text{Provisions}
\times
\text{Revertible Effects},\\[2mm]
\text{Runtime State}
&=
\text{Context}
+
\text{Fiber Registry}
+
\text{Committed Provider Views},\\[2mm]
\text{Continuous Evolution}
&=
\text{Reconciliation}
+
\text{Rollback}
+
\text{Dependency Drain},\\[2mm]
\text{Correctness Goal}
&=
\text{Recovery}
+
\text{Ordering}
+
\text{Progress}
+
\text{Confluence}.
\end{aligned}
}
$$

For ACRYL, I would summarize the architectural consequence as:

> **Persist the scene/context; make every actor, provider, tool, memory system, graph system and extension a reconciled fiber whose effects are bounded and whose dependencies are explicit.**

That is much closer to the paper's actual 79 pages of argument than the earlier abbreviated note.
