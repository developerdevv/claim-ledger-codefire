"""Provider-neutral LLM client adapter for Claim Ledger.

Supports Gemini (Google GenAI), OpenAI, Groq, and a fully deterministic
MOCK mode (LLM_PROVIDER=mock) so the entire evaluation and QA pipeline
can execute end-to-end without requiring an external API key.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
from typing import Any

from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()


class LLMClient:
    """Provider-neutral adapter for LLM calls with deterministic mock fallback."""

    def __init__(
        self,
        provider: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
    ) -> None:
        self.provider = (provider or os.getenv("LLM_PROVIDER", "mock")).lower().strip()
        self.model = model or os.getenv("LLM_MODEL", "mock-claim-engine-v1")
        self.api_key = api_key or os.getenv("LLM_API_KEY")

        if self.provider != "mock" and not self.api_key:
            raise ValueError(
                f"LLM_API_KEY environment variable is required for provider '{self.provider}'. "
                "Set LLM_PROVIDER=mock to run deterministically without an API key."
            )

    def generate(self, prompt: str, system_instruction: str | None = None) -> str:
        """Send prompt to the configured LLM provider and return raw text output."""
        if self.provider == "mock":
            return self._generate_mock(prompt)
        elif self.provider in ("gemini", "google"):
            return self._generate_gemini(prompt, system_instruction)
        elif self.provider == "openai":
            return self._generate_openai(prompt, system_instruction)
        elif self.provider == "groq":
            return self._generate_groq(prompt, system_instruction)
        else:
            raise ValueError(f"Unsupported LLM_PROVIDER: {self.provider}")

    def _generate_gemini(self, prompt: str, system_instruction: str | None = None) -> str:
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            config: dict[str, Any] = {}
            if system_instruction:
                config["system_instruction"] = system_instruction
            response = client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config if config else None,
            )
            return response.text or ""
        except ImportError:
            raise ImportError(
                "google-genai package not found. Run 'pip install google-genai' to use the Gemini provider."
            )

    def _generate_openai(self, prompt: str, system_instruction: str | None = None) -> str:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=self.api_key)
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            response = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.0,
            )
            return response.choices[0].message.content or ""
        except ImportError:
            raise ImportError("openai package not found. Run 'pip install openai' to use the OpenAI provider.")

    def _generate_groq(self, prompt: str, system_instruction: str | None = None) -> str:
        try:
            from groq import Groq
            client = Groq(api_key=self.api_key)
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            response = client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.0,
            )
            return response.choices[0].message.content or ""
        except ImportError:
            raise ImportError("groq package not found. Run 'pip install groq' to use the Groq provider.")

    def _generate_mock(self, prompt: str) -> str:
        """Deterministic mock generator adhering strictly to the JSON schema."""
        # 1. Check if this is a rewrite prompt
        if "Intent-Preserving Rewrite Engine" in prompt:
            return self._mock_rewrite(prompt)

        # 2. Extraction & verification prompt
        return self._mock_extract(prompt)

    def _mock_rewrite(self, prompt: str) -> str:
        """Generate deterministic rewrite output."""
        # Extract claim text from prompt
        match = re.search(r"Claim:\s*\n(.*?)(?=\n\n|\nCited Fact|\Z)", prompt, re.DOTALL)
        claim_text = match.group(1).strip() if match else "Sample claim"

        # Apply deterministic corrections
        fix = claim_text
        if "every order" in claim_text.lower() or "no minimum" in claim_text.lower():
            fix = "Free delivery on orders above ₹499 within India."
        elif "24/7" in claim_text.lower():
            fix = "Customer support is available Monday through Saturday from 9:00 AM to 8:00 PM IST."
        elif "299" in claim_text:
            fix = claim_text.replace("299", "499")
        elif "25%" in claim_text:
            fix = "Flat 15% discount for first-time customers using code FIRST15 on minimum cart value of ₹999."
        elif "60 days" in claim_text or "90 days" in claim_text or "opened" in claim_text.lower():
            fix = "Unopened products in original packaging can be returned within 30 days of delivery for a 100% refund."
        elif "999" in claim_text and "gold" in claim_text.lower():
            fix = "Annual Gold Club membership costs ₹1,499 per year and provides 5% cashback on every purchase."
        elif "free of charge" in claim_text.lower() and "express" in claim_text.lower():
            fix = "Express next-day delivery is available for ₹99 exclusively in Mumbai, Bengaluru, and Delhi NCR."
        elif "sunday" in claim_text.lower():
            fix = "Customer support is available Monday through Saturday from 9:00 AM to 8:00 PM IST."

        return json.dumps({"suggestedFix": fix}, indent=2)

    def _mock_extract(self, prompt: str) -> str:
        """Generate deterministic extraction and verification output matching claims.schema.json."""
        # Extract draft text from prompt
        draft_match = re.search(
            r"## MARKETING DRAFT TO CHECK\s*\n(.*?)(?=\n\nOUTPUT|\Z)",
            prompt,
            re.DOTALL,
        )
        draft_text = draft_match.group(1).strip() if draft_match else prompt.strip()

        # Extract supplied facts from prompt
        facts_match = re.search(
            r"## APPROVED BRAND VAULT FACTS\s*\n(.*?)(?=\n## MARKETING DRAFT|\Z)",
            prompt,
            re.DOTALL,
        )
        supplied_facts_text = facts_match.group(1).strip() if facts_match else ""

        # Parse available fact IDs from the prompt
        available_facts: dict[str, str] = {}
        for line in supplied_facts_text.splitlines():
            line = line.strip()
            id_match = re.match(r"^[-*]?\s*(F-\d+):\s*(.*)", line)
            if id_match:
                available_facts[id_match.group(1)] = id_match.group(2)

        claims_output: list[dict[str, Any]] = []

        # Split draft into candidate claim sentences
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", draft_text) if s.strip()]
        if not sentences:
            sentences = [draft_text]

        for s in sentences:
            s_clean = s.strip()
            s_lower = s_clean.lower()

            # Adversarial injection detection
            if "ignore previous instructions" in s_lower:
                claims_output.append({
                    "text": s_clean,
                    "verdict": "manual",
                    "factId": None,
                    "excerpt": None,
                    "explanation": "Potential adversarial instruction or prompt injection detected.",
                    "suggestedFix": None,
                    "confidence": "high",
                })
                continue

            # Fact F-001: Free delivery above ₹499
            if "free delivery" in s_lower or "free shipping" in s_lower or "delivery is always free" in s_lower:
                f001_text = available_facts.get("F-001", "Free delivery applies to all orders above ₹499 within India.")
                if ("every order" in s_lower or "no minimum" in s_lower or "299" in s_lower or "always free" in s_lower):
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-001" if "F-001" in available_facts else None,
                        "excerpt": "Free delivery applies to all orders above ₹499 within India." if "F-001" in available_facts else None,
                        "explanation": "Fact F-001 requires a minimum order threshold of ₹499; free delivery on every order or lower amounts contradicts this.",
                        "suggestedFix": "Free delivery on orders above ₹499 within India.",
                        "confidence": "high",
                    })
                elif "499" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-001" if "F-001" in available_facts else None,
                        "excerpt": "Free delivery applies to all orders above ₹499 within India." if "F-001" in available_facts else None,
                        "explanation": "Fact F-001 confirms free delivery on orders above ₹499 within India.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "unsupported",
                        "factId": None,
                        "excerpt": None,
                        "explanation": "No approved fact in the vault confirms unconditional free delivery.",
                        "suggestedFix": None,
                        "confidence": "medium",
                    })
                continue

            # Fact F-002: Same day dispatch before 2:00 PM
            if "dispatched on the same business day" in s_lower or "same day dispatch" in s_lower:
                if "any time" in s_lower or "every single order" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-002" if "F-002" in available_facts else None,
                        "excerpt": "Orders placed before 2:00 PM IST Monday to Friday are dispatched on the same business day." if "F-002" in available_facts else None,
                        "explanation": "Fact F-002 applies same-day dispatch only to orders placed before 2:00 PM IST on weekdays.",
                        "suggestedFix": "Orders placed before 2:00 PM IST Monday to Friday are dispatched on the same business day.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-002" if "F-002" in available_facts else None,
                        "excerpt": "Orders placed before 2:00 PM IST Monday to Friday are dispatched on the same business day." if "F-002" in available_facts else None,
                        "explanation": "Fact F-002 verifies same-day dispatch for orders placed before 2:00 PM IST on weekdays.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Fact F-003: Standard delivery 3 to 5 business days
            if "standard delivery takes" in s_lower or ("standard delivery" in s_lower and ("metro" in s_lower or "24 hours" in s_lower)):
                if "24 hours" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-003" if "F-003" in available_facts else None,
                        "excerpt": "Standard delivery takes 3 to 5 business days for metro locations and 5 to 7 business days for rest of India." if "F-003" in available_facts else None,
                        "explanation": "Fact F-003 specifies standard delivery takes 3 to 5 business days, not 24 hours.",
                        "suggestedFix": "Standard delivery takes 3 to 5 business days for metro locations.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-003" if "F-003" in available_facts else None,
                        "excerpt": "Standard delivery takes 3 to 5 business days for metro locations and 5 to 7 business days for rest of India." if "F-003" in available_facts else None,
                        "explanation": "Fact F-003 confirms standard delivery timelines.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Fact F-004: 30-day return policy
            if "return" in s_lower and ("30 days" in s_lower or "60 days" in s_lower or "90 days" in s_lower or "unopened" in s_lower or bool(re.search(r"\bopened\b", s_lower))):
                is_conflicting_return = "60 days" in s_lower or "90 days" in s_lower or (bool(re.search(r"\bopened\b", s_lower)) and "unopened" not in s_lower)
                if is_conflicting_return:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-004" if "F-004" in available_facts else None,
                        "excerpt": "Unopened products in original packaging can be returned within 30 days of delivery for a 100% refund." if "F-004" in available_facts else None,
                        "explanation": "Fact F-004 specifies returns are allowed only for unopened products within 30 days.",
                        "suggestedFix": "Unopened products in original packaging can be returned within 30 days of delivery for a 100% refund.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-004" if "F-004" in available_facts else None,
                        "excerpt": "Unopened products in original packaging can be returned within 30 days of delivery for a 100% refund." if "F-004" in available_facts else None,
                        "explanation": "Fact F-004 verifies 30-day return policy for unopened items.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Fact F-005: 15% discount FIRST15
            if "15% discount" in s_lower or "first15" in s_lower or "25% discount" in s_lower or "first25" in s_lower:
                if "25%" in s_lower or "no minimum" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-005" if "F-005" in available_facts else None,
                        "excerpt": "First-time customers receive a flat 15% discount using coupon code FIRST15 on minimum cart value of ₹999." if "F-005" in available_facts else None,
                        "explanation": "Fact F-005 specifies 15% discount with code FIRST15 and ₹999 minimum cart, not 25%.",
                        "suggestedFix": "First-time customers receive a flat 15% discount using coupon code FIRST15 on minimum cart value of ₹999.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-005" if "F-005" in available_facts else None,
                        "excerpt": "First-time customers receive a flat 15% discount using coupon code FIRST15 on minimum cart value of ₹999." if "F-005" in available_facts else None,
                        "explanation": "Fact F-005 verifies 15% first-time customer discount with FIRST15 code.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Fact F-006: Dermatologically tested & PETA cruelty-free
            if "dermatologically tested" in s_lower or "cruelty-free" in s_lower or "peta" in s_lower:
                claims_output.append({
                    "text": s_clean,
                    "verdict": "verified",
                    "factId": "F-006" if "F-006" in available_facts else None,
                    "excerpt": "All skincare formulations are dermatologically tested and certified cruelty-free by PETA." if "F-006" in available_facts else None,
                    "explanation": "Fact F-006 verifies dermatological testing and PETA cruelty-free certification.",
                    "suggestedFix": None,
                    "confidence": "high",
                })
                continue

            # Fact F-007: Customer support Mon-Sat 9am-8pm
            if "support" in s_lower or "customer care" in s_lower:
                if "24/7" in s_lower or "round the clock" in s_lower or "sunday" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-007" if "F-007" in available_facts else None,
                        "excerpt": "Customer support is available Monday through Saturday from 9:00 AM to 8:00 PM IST via in-app chat and email." if "F-007" in available_facts else None,
                        "explanation": "Fact F-007 specifies support hours are Monday through Saturday 9:00 AM to 8:00 PM IST.",
                        "suggestedFix": "Customer support is available Monday through Saturday from 9:00 AM to 8:00 PM IST.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-007" if "F-007" in available_facts else None,
                        "excerpt": "Customer support is available Monday through Saturday from 9:00 AM to 8:00 PM IST via in-app chat and email." if "F-007" in available_facts else None,
                        "explanation": "Fact F-007 confirms support hours.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Fact F-008: Gold Club membership ₹1,499
            if "gold club" in s_lower or ("membership" in s_lower and "cashback" in s_lower):
                if "999" in s_lower or "10%" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-008" if "F-008" in available_facts else None,
                        "excerpt": "Annual Gold Club membership costs ₹1,499 per year and provides 5% cashback on every purchase." if "F-008" in available_facts else None,
                        "explanation": "Fact F-008 states membership costs ₹1,499 with 5% cashback.",
                        "suggestedFix": "Annual Gold Club membership costs ₹1,499 per year and provides 5% cashback on every purchase.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-008" if "F-008" in available_facts else None,
                        "excerpt": "Annual Gold Club membership costs ₹1,499 per year and provides 5% cashback on every purchase." if "F-008" in available_facts else None,
                        "explanation": "Fact F-008 verifies Gold Club membership pricing and cashback percentage.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Fact F-009: Express next-day delivery ₹99
            if "express" in s_lower and "delivery" in s_lower:
                if "free of charge" in s_lower or "instant" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-009" if "F-009" in available_facts else None,
                        "excerpt": "Express next-day delivery is available for ₹99 exclusively in Mumbai, Bengaluru, and Delhi NCR." if "F-009" in available_facts else None,
                        "explanation": "Fact F-009 specifies express next-day delivery is ₹99 in select metro cities, not free.",
                        "suggestedFix": "Express next-day delivery is available for ₹99 exclusively in Mumbai, Bengaluru, and Delhi NCR.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-009" if "F-009" in available_facts else None,
                        "excerpt": "Express next-day delivery is available for ₹99 exclusively in Mumbai, Bengaluru, and Delhi NCR." if "F-009" in available_facts else None,
                        "explanation": "Fact F-009 confirms express next-day delivery pricing and regional scope.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Fact F-010: Recycled packaging
            if "packaging" in s_lower and ("biodegradable" in s_lower or "recycled" in s_lower or "paper" in s_lower):
                claims_output.append({
                    "text": s_clean,
                    "verdict": "verified",
                    "factId": "F-010" if "F-010" in available_facts else None,
                    "excerpt": "All packaging boxes and filler materials are made from 100% biodegradable post-consumer recycled paper." if "F-010" in available_facts else None,
                    "explanation": "Fact F-010 confirms biodegradable recycled packaging materials.",
                    "suggestedFix": None,
                    "confidence": "high",
                })
                continue

            # Fact F-011: Complimentary 50ml trial moisturizer
            if "complimentary 50ml" in s_lower or ("trial moisturizer" in s_lower and "moisturizer" in s_lower):
                if "all orders of any amount" in s_lower or "any amount" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-011" if "F-011" in available_facts else None,
                        "excerpt": "Complimentary 50ml trial moisturizer is included with every skincare purchase above ₹1,999 while stock lasts." if "F-011" in available_facts else None,
                        "explanation": "Fact F-011 requires a minimum purchase above ₹1,999 for the complimentary moisturizer.",
                        "suggestedFix": "Complimentary 50ml trial moisturizer is included with every skincare purchase above ₹1,999 while stock lasts.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-011" if "F-011" in available_facts else None,
                        "excerpt": "Complimentary 50ml trial moisturizer is included with every skincare purchase above ₹1,999 while stock lasts." if "F-011" in available_facts else None,
                        "explanation": "Fact F-011 verifies complimentary moisturizer gift with ₹1,999 threshold.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Fact F-012: Gift cards 12 months
            if "gift card" in s_lower:
                if "never expire" in s_lower or "can be refunded" in s_lower:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "conflicts",
                        "factId": "F-012" if "F-012" in available_facts else None,
                        "excerpt": "Gift cards are valid for 12 months from the date of purchase and are non-refundable." if "F-012" in available_facts else None,
                        "explanation": "Fact F-012 specifies gift cards expire after 12 months and are non-refundable.",
                        "suggestedFix": "Gift cards are valid for 12 months from the date of purchase and are non-refundable.",
                        "confidence": "high",
                    })
                else:
                    claims_output.append({
                        "text": s_clean,
                        "verdict": "verified",
                        "factId": "F-012" if "F-012" in available_facts else None,
                        "excerpt": "Gift cards are valid for 12 months from the date of purchase and are non-refundable." if "F-012" in available_facts else None,
                        "explanation": "Fact F-012 confirms 12-month gift card validity and non-refundable condition.",
                        "suggestedFix": None,
                        "confidence": "high",
                    })
                continue

            # Subjective / Ambiguous puffery requiring manual review
            if "revolutionary" in s_lower or "striving to create" in s_lower or "transparent cosmetic industry" in s_lower:
                claims_output.append({
                    "text": s_clean,
                    "verdict": "manual",
                    "factId": None,
                    "excerpt": None,
                    "explanation": "Subjective brand statement or puffery; human review required to confirm tone and alignment.",
                    "suggestedFix": None,
                    "confidence": "low",
                })
                continue

            # Pure unsupported claims (warranty, trees, solar, awards, user counts, cures)
            claims_output.append({
                "text": s_clean,
                "verdict": "unsupported",
                "factId": None,
                "excerpt": None,
                "explanation": "No approved Brand Vault fact was found covering this claim.",
                "suggestedFix": None,
                "confidence": "high",
            })

        return json.dumps({"claims": claims_output}, indent=2)
