# Murder Game

Un jeu de Murder Party en temps réel, jouable sur mobile et desktop. Chaque joueur rejoint une partie via son navigateur, et un administrateur configure puis lance la distribution des rôles : **Meurtrier**, **Innocent** ou **Justicier**.

## A propos du projet

Ce projet est une **expérimentation avec Claude (Anthropic) et l'IA en général**. L'intégralité du code a été générée et itérée à l'aide d'une intelligence artificielle, dans le but de tester les capacités actuelles des LLM pour la création d'applications web fonctionnelles de bout en bout.

L'objectif n'était pas de produire un projet "parfait", mais d'explorer jusqu'où l'IA peut aller dans la conception, le développement et la mise en place d'un petit jeu interactif multijoueur — du backend WebSocket au frontend React — en un minimum d'interventions humaines.

## Stack technique

- **Next.js 15** — Framework React
- **Socket.io** — Communication temps réel (WebSocket)
- **TypeScript** — Typage côté client
- **Node.js** — Serveur custom avec Socket.io intégré

## Fonctionnalités

- Rejoindre une partie en entrant son prénom
- Le premier joueur devient automatiquement admin
- L'admin configure le nombre de meurtriers, innocents et justiciers
- Lancement de la partie avec attribution aléatoire des rôles
- Les meurtriers voient leurs complices
- Possibilité de relancer une nouvelle partie
- Promotion automatique d'un nouvel admin si l'admin quitte

## Lancer le projet

```bash
npm install
npm run dev
```

Le serveur démarre sur `http://localhost:3000`.

## Points positifs de l'utilisation de l'IA

- **Rapidité de prototypage** — Le projet a été créé très rapidement, de l'idée au prototype fonctionnel, bien plus vite qu'un développement classique.
- **Cohérence du code** — L'IA produit un code structuré et lisible, en respectant les conventions modernes (hooks React, séparation client/serveur).
- **Polyvalence** — Un seul interlocuteur pour le frontend, le backend, le CSS, la logique métier et la configuration. Pas besoin de chercher dans la documentation de chaque librairie.
- **Itération facile** — Les modifications et ajouts se font en langage naturel, ce qui accélère considérablement le cycle de feedback.
- **Bon point de départ** — Même si le code n'est pas parfait, il fournit une base fonctionnelle solide sur laquelle un développeur peut itérer.

## Points négatifs de l'utilisation de l'IA

- **Manque de recul architectural** — L'IA ne challenge pas les choix de conception. Elle implémente ce qu'on lui demande sans proposer d'alternatives ou signaler des problèmes de scalabilité.
- **Pas de tests** — Aucun test unitaire ou d'intégration n'a été généré spontanément. La qualité repose entièrement sur la relecture humaine.
- **Gestion d'erreurs superficielle** — Le code fonctionne pour le "happy path", mais les cas limites (déconnexions en pleine partie, états incohérents) ne sont pas tous couverts.
- **Dépendance au contexte** — L'IA perd le fil sur les projets longs ou complexes. Il faut régulièrement lui rappeler le contexte et les décisions prises.
- **Faux sentiment de confiance** — Le code généré *a l'air* correct et professionnel, ce qui peut amener à ne pas le vérifier suffisamment. Des bugs subtils peuvent passer inaperçus.
- **Pas de créativité game-design** — L'IA implémente une mécanique, mais ne propose pas d'idées originales pour rendre le jeu plus fun ou engageant. La direction créative reste entièrement humaine.

---

*Projet généré avec l'aide de Claude (Anthropic) — Mars 2025*
