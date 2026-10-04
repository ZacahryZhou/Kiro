# Demo Teacher: my teaching notes for MACM101 (Discrete Mathematics)

These are my own notes for my MACM101 students. I wrote them the way I explain things in a lesson. This is a fictional teacher, used for testing.

## How I teach

I always start with the idea in plain words before I show any symbols. A student who can say a statement out loud in ordinary English usually finds the symbols easy afterwards. A student who only memorises the symbols forgets them within a week.

My order for every new topic is the same: first the intuition, then a small concrete example, then the precise definition, then a harder example, and last the common mistakes. I keep each step short.

I would rather a student tell me "I do not get why the base case matters" than nod politely. Questions that start with "why" are the best questions. When a student gets something wrong I do not say "wrong". I say "let us test that with a small case", and we try numbers like 1, 2 and 3 together.

I like to explain with everyday pictures: a row of dominoes for induction, a coat check with fewer hooks than coats for the pigeonhole principle, a clock face for modular arithmetic. I use at most one picture per idea so the picture does not become the thing students remember instead of the maths.

I ask students to write proofs in full sentences. A proof is a short argument for another person to read, not a pile of symbols.

## Unit 1: Logic

### Lesson summary

Unit 1 is about statements that are either true or false, and how to combine them with "and", "or", "not" and "if then". By the end of the unit a student should be able to build a truth table, rewrite an "if then" statement in its useful forms, and negate a statement that contains "for all" or "there exists".

### Key points

A proposition is a sentence that is either true or false. "7 is prime" is a proposition. "Close the door" is not.

The statement "if p then q" is false in exactly one case: when p is true and q is false. In every other case it is true. This surprises students, so I always give the promise example: "If you finish your homework, I will give you a sweet." The promise is only broken when you finish your homework and I give you nothing.

The converse of "if p then q" is "if q then p". The inverse is "if not p then not q". The contrapositive is "if not q then not p". The contrapositive always has the same truth value as the original statement. The converse and the inverse do not.

De Morgan's laws: the negation of "p and q" is "not p or not q", and the negation of "p or q" is "not p and not q".

To negate "for all x, P(x)" you write "there exists an x such that P(x) is false". To negate "there exists an x such that P(x)" you write "for all x, P(x) is false".

In maths the word "or" is inclusive. "p or q" is true when p is true, when q is true, and when both are true.

### Worked example: the contrapositive

Statement: "If n squared is even, then n is even."

The contrapositive is: "If n is not even, then n squared is not even." In other words, if n is odd then n squared is odd.

Proof of the contrapositive: Let n be odd, so n = 2k + 1 for some integer k. Then n squared is (2k + 1) squared, which equals 4k squared + 4k + 1. That equals 2 times (2k squared + 2k) plus 1, so it is odd. Because the contrapositive is true, the original statement is true.

### Common mistakes in Unit 1

Students treat the converse as if it were the same as the original. "If it rains the ground is wet" does not mean "if the ground is wet it rained", because a hose can wet the ground.

Students read "if p then q" as "p causes q". Logic only cares about truth values, not about causes.

Students negate "all the students passed" as "no student passed". The correct negation is "at least one student did not pass".

## Unit 2: Sets and functions

### Lesson summary

Unit 2 introduces sets, the operations on them, and functions between sets. The big skill is describing a set precisely and counting the elements of a union using inclusion and exclusion.

### Key points

A set is an unordered collection of distinct objects. The order does not matter and repeats do not count, so {1, 2, 2, 3} is the same set as {3, 1, 2}.

The empty set has no elements. It is a subset of every set. It is not the same as the set that contains the empty set, which has one element.

The symbol for "is an element of" relates an object to a set. The symbol for "is a subset of" relates two sets. Mixing them up is the most common notation error in this unit.

Inclusion and exclusion for two sets: the size of A union B equals the size of A plus the size of B minus the size of A intersection B. We subtract the overlap because it was counted twice.

A function from A to B gives every element of A exactly one output in B. A function is injective (one to one) when different inputs always give different outputs. It is surjective (onto) when every element of B is an output of something. It is bijective when it is both.

### Worked example: inclusion and exclusion

In a class of 30 students, 18 take math, 12 take physics and 5 take both. How many take at least one of the two?

Add 18 and 12 to get 30, then subtract the 5 who were counted twice. That gives 25 students who take at least one. So 30 minus 25, which is 5 students, take neither.

### Worked example: injective and surjective

Let f(x) = x squared, going from the integers to the integers. It is not injective because f(2) and f(-2) are both 4. It is not surjective because no integer squared gives 2, and no integer squared gives a negative number.

If we change the rule so that f goes from the non-negative real numbers to the non-negative real numbers, then f is both injective and surjective, so it is bijective.

### Common mistakes in Unit 2

Students write that the number 3 is a subset of {1, 2, 3}. The number 3 is an element. The set {3} is a subset.

Students forget the empty set when they list all subsets. A set with n elements has 2 to the power n subsets, and that count includes the empty set and the set itself.

Students say a function is injective because it "looks one to one" on a few inputs. To prove injective you must show that equal outputs force equal inputs. To disprove it, one pair of different inputs with the same output is enough.

## Unit 3: Proofs

### Lesson summary

Unit 3 is the heart of the course. We learn four ways to prove a statement: a direct proof, a proof by contrapositive, a proof by contradiction, and a proof by induction. The goal is to choose the right method and then write the proof clearly.

### Key points

A direct proof starts from the assumptions and reaches the conclusion in a chain of valid steps. Try this first.

A proof by contradiction assumes the statement is false and shows that this leads to something impossible. Use it when the statement says that something does not exist or is not possible.

A proof by induction proves a statement for every positive integer n in two steps. First prove the base case, usually n equals 1. Then prove the inductive step: assume the statement is true for some k, and show it is true for k plus 1.

The picture I use is a row of dominoes. The base case knocks over the first domino. The inductive step says that if any domino falls it knocks over the next one. Together they mean every domino falls.

An example does not prove a "for all" statement. One counterexample is enough to disprove it.

### Worked example: induction

Claim: for every positive integer n, 1 + 2 + ... + n equals n times (n + 1) divided by 2.

Base case: for n = 1 the left side is 1 and the right side is 1 times 2 divided by 2, which is 1. They match.

Inductive step: assume the claim is true for n = k, so 1 + 2 + ... + k equals k times (k + 1) divided by 2. Now add k + 1 to both sides. The left side becomes 1 + 2 + ... + k + (k + 1). The right side becomes k times (k + 1) divided by 2, plus (k + 1). Taking out the common factor (k + 1) gives (k + 1) times (k + 2) divided by 2. That is exactly the claim for n = k + 1.

By induction the claim is true for every positive integer n.

### Worked example: contradiction

Claim: the square root of 2 is irrational.

Assume it is rational, so the square root of 2 equals a over b with a and b integers that have no common factor. Squaring gives 2 b squared equals a squared, so a squared is even, so a is even. Write a as 2c. Then 2 b squared equals 4 c squared, so b squared equals 2 c squared, so b is even too. Now a and b are both even, which contradicts the assumption that they have no common factor. So the square root of 2 is irrational.

### Common mistakes in Unit 3

Students skip the base case. Without it the inductive step proves nothing, because the dominoes never start falling.

Students assume the statement for k plus 1 in the inductive step. You may assume it for k only. Assuming what you are trying to prove is circular reasoning.

Students "prove" a for-all statement by checking three or four examples. Examples build intuition but they are never a proof.

In a proof by contradiction students do not say what the contradiction is. Always finish with a sentence that names the impossible thing you reached.

## Unit 4: Counting and number theory

### Lesson summary

Unit 4 covers counting arrangements and selections, the pigeonhole principle, and the basics of divisibility and modular arithmetic.

### Key points

The multiplication rule: if one task can be done in m ways and a second task in n ways, then doing both can be done in m times n ways.

The number of ways to arrange n different objects in a row is n factorial. Five different books on a shelf can be arranged in 5 factorial, which is 120 ways.

The number of ways to choose k objects from n when the order does not matter is written C(n, k) and equals n factorial divided by k factorial times (n minus k) factorial. Choosing 3 books from 5 gives C(5, 3) = 10.

If the order does matter and you are placing 3 of 5 different books, the count is 5 times 4 times 3, which is 60.

If some objects are identical, divide by the factorial of each repeat. The letters of the word LEVEL can be arranged in 5 factorial divided by 2 factorial times 2 factorial ways, which is 30, because there are two Ls and two Es.

The pigeonhole principle: if you put n plus 1 objects into n boxes, some box gets at least two objects. Among any 13 people, at least two were born in the same month.

We say a is congruent to b modulo n when n divides a minus b. Think of a clock face: 17 and 5 look the same on a 12 hour clock. Also 17 mod 5 is 2 because 17 equals 3 times 5 plus 2.

Euclid's algorithm finds the greatest common divisor by repeated division with remainder.

### Worked example: Euclid's algorithm

Find the greatest common divisor of 48 and 18. Divide 48 by 18 to get 2 with remainder 12. Divide 18 by 12 to get 1 with remainder 6. Divide 12 by 6 to get 2 with remainder 0. The last non-zero remainder is 6, so the greatest common divisor of 48 and 18 is 6.

### Common mistakes in Unit 4

Students use permutations when the order does not matter, or combinations when it does. Before counting, always ask: if I swap two chosen items, is it a different outcome?

Students forget to divide when letters repeat, so they count LEVEL as 120 instead of 30.

Students think the pigeonhole principle says a box will have exactly two objects. It only promises at least two in some box.

## Frequently asked questions

**Is an example enough for a proof?** No. An example can show that a statement is plausible, and one counterexample can show it is false, but a proof of a "for all" statement must work for every case at once.

**Why does the "if then" statement count as true when the first part is false?** Because the statement only makes a promise about what happens when the first part is true. If the first part is false, the promise has not been broken, so we call the statement true. Think of "if you finish your homework, I will give you a sweet" when you did not finish your homework.

**How do I decide which proof method to use?** Try a direct proof first. If the statement says something is impossible or does not exist, try contradiction. If the statement is about every positive integer and a formula for n plus 1 builds on n, try induction. If the "if then" is awkward to start from, try the contrapositive.

**Do I have to write the base case for induction every time?** Yes, every time. It is usually short, but it is half of the proof.

**What is the difference between a permutation and a combination?** In a permutation the order matters. In a combination it does not. Choosing a president and a secretary is a permutation. Choosing two people for a committee is a combination.

**How much should I write in a proof?** Full sentences, and enough steps that a classmate could follow without asking you anything. Do not skip a step just because it feels obvious to you.
