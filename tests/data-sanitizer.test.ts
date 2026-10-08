// tests/data-sanitizer.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import {
  DataSanitizer,
  SANITIZATION_PRESETS,
  SanitizationRule,
} from "../src/data-sanitizer";
import { LogLevel } from "../src/types";
import type { LogEntry } from "../src/types";
import {
  PII_TEST_CASES,
  NESTED_OBJECT_WITH_PII,
  ARRAY_WITH_PII,
  SENSITIVE_FIELD_NAMES,
  CIRCULAR_REFERENCE_OBJECT,
} from "./fixtures/test-data";

// Helper: wrap arbitrary data in a LogEntry so we can call sanitizeLogEntry
function makeLogEntry(
  data: Record<string, any>,
  message: string = "test"
): LogEntry {
  return {
    projectId: "test",
    level: LogLevel.INFO,
    message,
    data,
  };
}

// Helper: sanitize a data object and return the sanitized data
function sanitizeData(
  sanitizer: DataSanitizer,
  data: Record<string, any>
): Record<string, any> {
  const entry = makeLogEntry(data);
  const result = sanitizer.sanitizeLogEntry(entry);
  return result.data || {};
}

describe("DataSanitizer", () => {
  let sanitizer: DataSanitizer;

  // For PII pattern detection tests, disable anonymization so field-level
  // anonymization doesn't overwrite the regex replacement values.
  let patternOnlySanitizer: DataSanitizer;

  beforeEach(() => {
    sanitizer = new DataSanitizer();
    patternOnlySanitizer = new DataSanitizer({ anonymizationEnabled: false });
  });

  describe("PII Pattern Detection", () => {
    describe("Email Detection", () => {
      it("should redact valid email addresses", () => {
        PII_TEST_CASES.email.valid.forEach((emailVal) => {
          // Use a non-sensitive field name to avoid anonymization interference
          const result = sanitizeData(patternOnlySanitizer, { contactEmail: emailVal });
          expect(result.contactEmail).toBe("[EMAIL_REDACTED]");
        });
      });

      it("should not redact invalid email-like strings", () => {
        PII_TEST_CASES.email.invalid.forEach((notEmail) => {
          const result = sanitizeData(patternOnlySanitizer, { text: notEmail });
          expect(result.text).toBe(notEmail);
        });
      });

      it("should redact emails in longer text", () => {
        const text = "Contact me at john@example.com for more info";
        const entry: LogEntry = {
          projectId: "test",
          level: LogLevel.INFO,
          message: text,
          data: {},
        };
        const result = patternOnlySanitizer.sanitizeLogEntry(entry);
        expect(result.message).toContain("[EMAIL_REDACTED]");
        expect(result.message).not.toContain("john@example.com");
      });
    });

    describe("SSN Detection", () => {
      it("should redact valid SSN formats", () => {
        PII_TEST_CASES.ssn.valid.forEach((ssnVal) => {
          const result = sanitizeData(patternOnlySanitizer, { socialSec: ssnVal });
          // SSN pattern also catches via bank account pattern; check it's not the original
          expect(result.socialSec).not.toBe(ssnVal);
          expect(result.socialSec).toContain("REDACTED");
        });
      });

      it("should not redact invalid SSN formats", () => {
        PII_TEST_CASES.ssn.invalid.forEach((invalid) => {
          const result = sanitizeData(patternOnlySanitizer, { text: invalid });
          expect(result.text).toBe(invalid);
        });
      });
    });

    describe("Credit Card Detection", () => {
      it("should redact valid credit card numbers", () => {
        // Test with cards that match the regex: 4 groups of 4 digits
        const standardCards = [
          "4111 1111 1111 1111", // Visa
          "5500 0000 0000 0004", // Mastercard
          "6011111111111117", // Discover (no spaces)
        ];
        standardCards.forEach((card) => {
          const result = sanitizeData(patternOnlySanitizer, { cardNum: card });
          expect(result.cardNum).toContain("REDACTED");
        });
      });

      it("should not redact invalid card-like numbers", () => {
        PII_TEST_CASES.creditCard.invalid.forEach((invalid) => {
          const result = sanitizeData(patternOnlySanitizer, { text: invalid });
          expect(result.text).toBe(invalid);
        });
      });
    });

    describe("Phone Number Detection", () => {
      it("should redact various phone number formats", () => {
        // US format phones that match the regex
        const usPhones = [
          "(555) 123-4567",
          "555-123-4567",
          "5551234567",
          "+1-202-555-0173",
        ];
        usPhones.forEach((phoneVal) => {
          const result = sanitizeData(patternOnlySanitizer, { phoneNum: phoneVal });
          expect(result.phoneNum).toContain("REDACTED");
        });
      });

      it("should not redact invalid phone numbers", () => {
        PII_TEST_CASES.phone.invalid.forEach((invalid) => {
          const result = sanitizeData(patternOnlySanitizer, { text: invalid });
          expect(result.text).toBe(invalid);
        });
      });
    });

    describe("IP Address Detection", () => {
      it("should redact valid IP addresses", () => {
        PII_TEST_CASES.ip.valid.forEach((ip) => {
          const result = sanitizeData(patternOnlySanitizer, { ipAddr: ip });
          expect(result.ipAddr).toContain("REDACTED");
        });
      });

      it("should not redact invalid IP-like strings", () => {
        PII_TEST_CASES.ip.invalid.forEach((invalid) => {
          const result = sanitizeData(patternOnlySanitizer, { text: invalid });
          expect(result.text).toBe(invalid);
        });
      });

      it("should leave browser versions in user agents alone", () => {
        // Chrome reports its version as four numbers that read like an IP
        const ua =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/137.0.0.0 Safari/537.36";
        const result = sanitizeData(patternOnlySanitizer, { userAgent: ua });
        expect(result.userAgent).toBe(ua);
      });

      it("should still redact addresses in text, JSON, URLs and at the end of a sentence", () => {
        const cases: Record<string, string> = {
          "request from 10.0.0.12 failed": "request from [IP_REDACTED] failed",
          '{"ip":"192.168.1.20"}': '{"ip":"[IP_REDACTED]"}',
          "GET http://172.16.0.5:8080/health": "GET http://[IP_REDACTED]:8080/health",
          "blocked 203.0.113.9.": "blocked [IP_REDACTED].",
          "x-forwarded-for=8.8.8.8": "x-forwarded-for=[IP_REDACTED]",
        };
        for (const [input, expected] of Object.entries(cases)) {
          expect(sanitizeData(patternOnlySanitizer, { text: input }).text).toBe(expected);
        }
      });
    });

    describe("JWT Token Detection", () => {
      it("should redact valid JWT tokens", () => {
        PII_TEST_CASES.jwt.valid.forEach((jwt) => {
          const result = sanitizeData(patternOnlySanitizer, { jwtVal: jwt });
          expect(result.jwtVal).toContain("REDACTED");
        });
      });

      it("should not redact strings that look like JWTs but aren't", () => {
        PII_TEST_CASES.jwt.invalid.forEach((invalid) => {
          const result = sanitizeData(patternOnlySanitizer, { text: invalid });
          expect(result.text).toBe(invalid);
        });
      });
    });
  });

  describe("Nested Object Sanitization", () => {
    it("should sanitize PII in deeply nested objects", () => {
      const result = sanitizeData(patternOnlySanitizer, NESTED_OBJECT_WITH_PII);

      // Check email redacted (field name contains "email" but anonymization disabled)
      expect(result.user.email).toContain("REDACTED");

      // Check phone redacted
      expect(result.user.profile.phone).toContain("REDACTED");

      // Check SSN redacted
      expect(result.user.profile.ssn).toContain("REDACTED");

      // Check credit card redacted
      expect(result.user.payment.cardNumber).toContain("REDACTED");

      // Check IP redacted
      expect(result.metadata.ip).toContain("REDACTED");

      // Check non-PII fields remain unchanged
      expect(result.user.name).toBe("John Doe");
      expect(result.user.profile.address.city).toBe("New York");
    });

    it("should handle objects with multiple levels of nesting", () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                contactEmail: "deep@example.com",
              },
            },
          },
        },
      };

      const result = sanitizeData(patternOnlySanitizer, deepObject);
      expect(result.level1.level2.level3.level4.contactEmail).toBe(
        "[EMAIL_REDACTED]"
      );
    });
  });

  describe("Array Sanitization", () => {
    it("should sanitize PII in array elements", () => {
      const result = sanitizeData(patternOnlySanitizer, {
        items: ARRAY_WITH_PII,
      });

      expect(result.items[0].email).toContain("REDACTED");
      expect(result.items[1].email).toContain("REDACTED");
      expect(result.items[2].contacts[0].phone).toContain("REDACTED");
      expect(result.items[2].contacts[1].phone).toContain("REDACTED");

      // Non-PII fields should remain
      expect(result.items[0].name).toBe("User 1");
      expect(result.items[2].contacts[0].type).toBe("mobile");
    });

    it("should handle arrays of primitive values", () => {
      const data = {
        contacts: [
          "user1@example.com",
          "user2@example.com",
          "user3@example.com",
        ],
      };

      const result = sanitizeData(patternOnlySanitizer, data);
      expect(result.contacts).toEqual([
        "[EMAIL_REDACTED]",
        "[EMAIL_REDACTED]",
        "[EMAIL_REDACTED]",
      ]);
    });
  });

  describe("Circular Reference Handling", () => {
    it("should handle circular references without crashing", () => {
      expect(() => {
        sanitizeData(patternOnlySanitizer, { ref: CIRCULAR_REFERENCE_OBJECT });
      }).not.toThrow();
    });

    it("should still sanitize PII in objects with circular references", () => {
      const result = sanitizeData(patternOnlySanitizer, {
        ref: CIRCULAR_REFERENCE_OBJECT,
      });
      expect(result.ref.email).toContain("REDACTED");
      expect(result.ref.name).toBe("Test");
    });

    it("should handle complex circular structures", () => {
      const obj1: any = { name: "obj1", contactEmail: "test@example.com" };
      const obj2: any = { name: "obj2", parent: obj1 };
      obj1.child = obj2;

      const result = sanitizeData(patternOnlySanitizer, { root: obj1 });
      expect(result.root.contactEmail).toContain("REDACTED");
      expect(result.root.child.name).toBe("obj2");
    });
  });

  describe("Custom Sanitization Rules", () => {
    it("should add custom sanitization rules", () => {
      patternOnlySanitizer.addCustomRule({
        pattern: /CUSTOM-\d{6}/g,
        replacement: "[CUSTOM_REDACTED]",
        description: "customPattern",
        severity: "low" as const,
        category: "custom" as const,
      });

      const result = sanitizeData(patternOnlySanitizer, {
        code: "CUSTOM-123456",
      });
      expect(result.code).toBe("[CUSTOM_REDACTED]");
    });

    it("should remove custom rules", () => {
      patternOnlySanitizer.addCustomRule({
        pattern: /TEMP-\d+/g,
        replacement: "[TEMP_REDACTED]",
        description: "temp",
        severity: "low" as const,
        category: "custom" as const,
      });
      patternOnlySanitizer.removeCustomRule("temp");

      const result = sanitizeData(patternOnlySanitizer, { code: "TEMP-999" });
      expect(result.code).toBe("TEMP-999"); // Not redacted
    });

    it("should apply multiple custom rules", () => {
      patternOnlySanitizer.addCustomRule({
        pattern: /SECRET-A/g,
        replacement: "[A_REDACTED]",
        description: "rule1",
        severity: "low" as const,
        category: "custom" as const,
      });
      patternOnlySanitizer.addCustomRule({
        pattern: /SECRET-B/g,
        replacement: "[B_REDACTED]",
        description: "rule2",
        severity: "low" as const,
        category: "custom" as const,
      });

      const result = sanitizeData(patternOnlySanitizer, {
        a: "SECRET-A",
        b: "SECRET-B",
      });

      expect(result.a).toBe("[A_REDACTED]");
      expect(result.b).toBe("[B_REDACTED]");
    });
  });

  describe("Sanitization Presets", () => {
    it("should apply STRICT preset", () => {
      const strictSanitizer = new DataSanitizer({
        ...SANITIZATION_PRESETS.STRICT,
        anonymizationEnabled: false,
      });

      const result = sanitizeData(strictSanitizer, {
        contactEmail: "user@example.com",
        text: "some text",
      });

      expect(result.contactEmail).toContain("REDACTED");
    });

    it("should apply BALANCED preset", () => {
      const balancedSanitizer = new DataSanitizer({
        ...SANITIZATION_PRESETS.BALANCED,
        anonymizationEnabled: false,
      });

      const result = sanitizeData(balancedSanitizer, {
        contactEmail: "user@example.com",
        socialSec: "123-45-6789",
      });

      expect(result.contactEmail).toContain("REDACTED");
      expect(result.socialSec).toContain("REDACTED");
    });

    it("should apply LENIENT preset", () => {
      const lenientSanitizer = new DataSanitizer(SANITIZATION_PRESETS.LENIENT);

      const result = sanitizeData(lenientSanitizer, {
        contactEmail: "user@example.com",
        data: "some data",
      });

      // LENIENT preset has anonymizationEnabled: false and only critical severity rules
      // Email pattern has severity 'high', not 'critical', so email won't be redacted
      expect(result.data).toBe("some data");
    });
  });

  describe("Field Anonymization", () => {
    it("should anonymize sensitive field names", () => {
      // The default sensitiveFields are: ['password', 'secret', 'token', 'key', 'ssn', 'email']
      // anonymizeValue for strings > 4 chars: first + asterisks + last
      // anonymizeValue for strings <= 4 chars: '[ANONYMIZED]'
      const result = sanitizeData(sanitizer, {
        password: "secret123",
        username: "john",
      });

      // password is a sensitive field; after sanitizeString + anonymizeValue, it should be changed
      expect(result.password).not.toBe("secret123");
      expect(result.username).toBe("john");
    });

    it("should handle nested sensitive field names", () => {
      const data = {
        user: {
          credentials: {
            password: "secret123",
          },
          profile: {
            name: "John",
          },
        },
      };

      const result = sanitizeData(sanitizer, data);
      expect(result.user.credentials.password).not.toBe("secret123");
      expect(result.user.profile.name).toBe("John");
    });
  });

  describe("Audit Trail", () => {
    it("should log sanitization operations to audit trail", () => {
      const data = {
        contactEmail: "test@example.com",
      };

      sanitizeData(sanitizer, data);
      const auditTrail = sanitizer.getAuditTrail();

      expect(auditTrail.length).toBeGreaterThan(0);
      expect(auditTrail[0]).toHaveProperty("rulesApplied");
      expect(auditTrail[0].rulesApplied.length).toBeGreaterThan(0);
    });

    it("should cap audit trail at 1000 entries", () => {
      // Perform many sanitizations
      for (let i = 0; i < 1100; i++) {
        sanitizeData(sanitizer, { contactEmail: "test@example.com" });
      }

      const auditTrail = sanitizer.getAuditTrail();
      expect(auditTrail.length).toBeLessThanOrEqual(1000);
    });

    it("should include rules applied in audit trail", () => {
      const data = {
        user: {
          contact: {
            contactEmail: "test@example.com",
          },
        },
      };

      sanitizeData(sanitizer, data);
      const auditTrail = sanitizer.getAuditTrail();

      expect(auditTrail.length).toBeGreaterThan(0);
      const entry = auditTrail[0];
      expect(entry.rulesApplied).toBeDefined();
      expect(Array.isArray(entry.rulesApplied)).toBe(true);
    });

    it("should clear audit trail", () => {
      sanitizeData(sanitizer, { contactEmail: "test@example.com" });
      expect(sanitizer.getAuditTrail().length).toBeGreaterThan(0);

      sanitizer.clearAuditTrail();
      expect(sanitizer.getAuditTrail().length).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle null values gracefully", () => {
      const result = sanitizeData(sanitizer, { value: null });
      expect(result.value).toBeNull();
    });

    it("should handle undefined values gracefully", () => {
      const result = sanitizeData(sanitizer, { value: undefined });
      expect(result.value).toBeUndefined();
    });

    it("should handle empty objects", () => {
      const result = sanitizeData(sanitizer, {});
      expect(result).toEqual({});
    });

    it("should handle empty arrays", () => {
      const result = sanitizeData(sanitizer, { arr: [] });
      expect(result.arr).toEqual([]);
    });

    it("should handle mixed type arrays", () => {
      const data = {
        mixed: [
          "test@example.com",
          123,
          true,
          null,
          { contactEmail: "nested@example.com" },
        ],
      };

      const result = sanitizeData(patternOnlySanitizer, data);
      expect(result.mixed[0]).toBe("[EMAIL_REDACTED]");
      expect(result.mixed[1]).toBe(123);
      expect(result.mixed[2]).toBe(true);
      expect(result.mixed[3]).toBeNull();
      expect(result.mixed[4].contactEmail).toBe("[EMAIL_REDACTED]");
    });

    it("should handle very long strings", () => {
      const longString =
        "a".repeat(10000) + "test@example.com" + "b".repeat(10000);
      const result = sanitizeData(patternOnlySanitizer, { text: longString });
      expect(result.text).toContain("[EMAIL_REDACTED]");
      expect(result.text).not.toContain("test@example.com");
    });

    it("should handle objects with special characters in keys", () => {
      const data = {
        "user-contact": "test@example.com",
        "data-key": "value",
        "key.with.dots": "data",
      };

      const result = sanitizeData(patternOnlySanitizer, data);
      expect(result["user-contact"]).toBe("[EMAIL_REDACTED]");
      expect(result["data-key"]).toBe("value");
    });
  });

  describe("Performance", () => {
    it("should sanitize large objects in reasonable time", () => {
      const largeObject: any = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`field${i}`] = {
          contactEmail: "test@example.com",
          data: "some data",
          nested: {
            value: i,
          },
        };
      }

      const start = Date.now();
      sanitizeData(sanitizer, largeObject);
      const duration = Date.now() - start;

      // Should complete in less than 1 second
      expect(duration).toBeLessThan(1000);
    });

    it("should handle deep nesting without stack overflow", () => {
      let deepObj: any = { contactEmail: "test@example.com" };
      for (let i = 0; i < 100; i++) {
        deepObj = { nested: deepObj };
      }

      expect(() => {
        sanitizeData(sanitizer, deepObj);
      }).not.toThrow();
    });
  });
});
