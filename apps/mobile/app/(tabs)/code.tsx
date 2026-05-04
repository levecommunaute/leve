import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { apiFetch } from "../../lib/api";

const BG = "#080808";
const TEXT = "#F5F0E8";
const ROUGE = "#C0392B";

type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
};

type QuizPayload = {
  id?: string;
  questions: QuizQuestion[];
};

function formatCodeSegment(raw: string): string {
  const alnum = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const parts: string[] = [];
  for (let i = 0; i < alnum.length && parts.length < 3; i += 4) {
    parts.push(alnum.slice(i, i + 4));
  }
  return parts.join("-").slice(0, 14);
}

function parseQuiz(data: unknown): QuizPayload | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const quiz = (root.quiz ?? root) as Record<string, unknown>;
  const rawQs = quiz.questions ?? root.questions;
  if (!Array.isArray(rawQs) || rawQs.length === 0) return null;
  const questions: QuizQuestion[] = rawQs.slice(0, 10).map((q, idx) => {
    if (!q || typeof q !== "object") {
      return { id: String(idx), question: "", options: [] };
    }
    const o = q as Record<string, unknown>;
    const opts = (o.options ?? o.choices ?? o.reponses) as unknown;
    const options = Array.isArray(opts)
      ? opts.map((x) => String(x))
      : [];
    return {
      id: String(o.id ?? idx),
      question: String(o.question ?? o.texte ?? o.label ?? ""),
      options,
    };
  });
  const id = quiz.id !== undefined ? String(quiz.id) : undefined;
  return { id, questions };
}

export default function CodeScreen() {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(90);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [validatedCode, setValidatedCode] = useState("");
  const quizSubmitDone = useRef(false);
  const autoTimeSubmitFired = useRef(false);

  const normalizedCode = useMemo(() => formatCodeSegment(code), [code]);

  useEffect(() => {
    if (!quizOpen) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => (s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [quizOpen]);

  const closeQuiz = useCallback(() => {
    setQuizOpen(false);
    setQuiz(null);
    setValidatedCode("");
    quizSubmitDone.current = false;
    autoTimeSubmitFired.current = false;
  }, []);

  const submitQuiz = useCallback(async () => {
    if (!quiz || quizSubmitDone.current) return;
    quizSubmitDone.current = true;
    try {
      await apiFetch("/api/quiz/submit", {
        method: "POST",
        json: {
          quiz_id: quiz.id,
          code: validatedCode,
          answers,
          time_remaining_seconds: secondsLeft,
        },
      });
      Alert.alert("Quiz", "Réponses envoyées.");
      closeQuiz();
    } catch (e) {
      quizSubmitDone.current = false;
      Alert.alert("Erreur", e instanceof Error ? e.message : "Échec envoi");
    }
  }, [quiz, validatedCode, answers, secondsLeft, closeQuiz]);

  useEffect(() => {
    if (!quizOpen || secondsLeft > 0) return;
    if (autoTimeSubmitFired.current) return;
    autoTimeSubmitFired.current = true;
    void submitQuiz();
  }, [quizOpen, secondsLeft, submitQuiz]);

  const onChangeCode = (t: string) => {
    setCode(formatCodeSegment(t));
  };

  const onValidateCode = async () => {
    const c = normalizedCode;
    if (c.length < 14) {
      Alert.alert("Code", "Format requis : XXXX-XXXX-XXXX");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<unknown>("/api/code/valider", {
        method: "POST",
        json: { code: c },
      });
      const payload = res as Record<string, unknown>;
      const ok =
        payload.valid === true ||
        payload.success === true ||
        payload.ok === true;
      const parsed = parseQuiz(res);
      if (!ok && !parsed) {
        throw new Error(
          String(payload.message ?? payload.error ?? "Code invalide")
        );
      }
      if (!parsed || parsed.questions.length < 1) {
        Alert.alert("Code", "Code accepté, mais aucun quiz reçu.");
        return;
      }
      quizSubmitDone.current = false;
      autoTimeSubmitFired.current = false;
      setValidatedCode(c);
      setQuiz(parsed);
      setAnswers({});
      setSecondsLeft(90);
      setQuizOpen(true);
    } catch (e) {
      Alert.alert("Code", e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  };

  const selectAnswer = (qid: string, optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [qid]: optionIndex }));
  };

  const firstFive = quiz ? quiz.questions.slice(0, 5) : [];

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Code PMQ</Text>
      <Text style={styles.hint}>Format : XXXX-XXXX-XXXX</Text>
      <TextInput
        value={normalizedCode}
        onChangeText={onChangeCode}
        placeholder="XXXX-XXXX-XXXX"
        placeholderTextColor="#6a6560"
        autoCapitalize="characters"
        keyboardType="default"
        maxLength={14}
        style={styles.input}
      />
      <Pressable
        style={({ pressed }) => [
          styles.submitBtn,
          pressed && styles.submitPressed,
          submitting && styles.submitDisabled,
        ]}
        onPress={() => void onValidateCode()}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color={TEXT} />
        ) : (
          <Text style={styles.submitLabel}>Valider le code</Text>
        )}
      </Pressable>

      <Modal
        visible={quizOpen}
        animationType="slide"
        transparent
        onRequestClose={closeQuiz}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.timerRow}>
              <Text style={styles.timerLabel}>Temps restant</Text>
              <Text style={styles.timerValue}>{secondsLeft}s</Text>
            </View>
            <Text style={styles.modalTitle}>Quiz (5 questions)</Text>
            <ScrollView style={styles.quizScroll}>
              {firstFive.map((q, qi) => (
                <View key={q.id} style={styles.qBlock}>
                  <Text style={styles.qTitle}>
                    {qi + 1}. {q.question}
                  </Text>
                  {q.options.map((opt, oi) => {
                    const selected = answers[q.id] === oi;
                    return (
                      <Pressable
                        key={`${q.id}-${oi}`}
                        onPress={() => selectAnswer(q.id, oi)}
                        style={[
                          styles.option,
                          selected && styles.optionSelected,
                        ]}
                      >
                        <Text style={styles.optionText}>{opt}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <Pressable
              style={styles.modalSubmit}
              onPress={() => {
                autoTimeSubmitFired.current = true;
                void submitQuiz();
              }}
            >
              <Text style={styles.modalSubmitText}>Envoyer le quiz</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  title: {
    color: TEXT,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  hint: {
    color: "#a39e96",
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    letterSpacing: 2,
    color: TEXT,
    backgroundColor: "#121212",
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: ROUGE,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitPressed: { opacity: 0.9 },
  submitDisabled: { opacity: 0.6 },
  submitLabel: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#121212",
    borderRadius: 16,
    maxHeight: "90%",
    padding: 16,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  timerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  timerLabel: { color: "#a39e96" },
  timerValue: { color: ROUGE, fontWeight: "800", fontSize: 18 },
  modalTitle: {
    color: TEXT,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  quizScroll: { maxHeight: 420 },
  qBlock: { marginBottom: 20 },
  qTitle: { color: TEXT, fontSize: 15, fontWeight: "600", marginBottom: 10 },
  option: {
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  optionSelected: {
    borderColor: ROUGE,
    backgroundColor: "#2a1512",
  },
  optionText: { color: TEXT },
  modalSubmit: {
    marginTop: 8,
    backgroundColor: ROUGE,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSubmitText: { color: TEXT, fontWeight: "700", fontSize: 16 },
});
