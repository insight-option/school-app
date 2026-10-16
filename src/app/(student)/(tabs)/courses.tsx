import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Card, EmptyState, Screen, SkeletonCard, Text, useTheme } from '../../../ui';
import { useMyProfile } from '../../../features/profiles';
import { useCoursesForClass } from '../../../features/ops';
import { useSignedUrl } from '../../../lib/storage/s3';
import { Image } from 'expo-image';

/** "My Courses": shows a friendly coming-soon state until the office publishes courses for the class. */
export default function StudentCourses() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const me = useMyProfile();
  const courses = useCoursesForClass(me.data?.classId);

  return (
    <Screen title={t('tabs.courses')} scroll>
      {courses.isLoading && !courses.data ? (
        <View style={{ gap: theme.spacing.md }}>
          <SkeletonCard />
        </View>
      ) : !courses.data?.length ? (
        <EmptyState icon="school-outline" title={t('student.coursesEmptyTitle')} body={t('student.coursesEmptyBody')} />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {courses.data.map((c) => (
            <CourseCard key={c.id} id={c.id} title={c.title} description={c.description} coverKey={c.coverKey} lessonCount={c.lessonCount ?? 0} onPress={() => router.push(`/(student)/course/${c.id}` as never)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function CourseCard({ title, description, coverKey, lessonCount, onPress }: { id: string; title: string; description?: string | null; coverKey?: string | null; lessonCount: number; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const cover = useSignedUrl(coverKey);
  return (
    <Card onPress={onPress} padding={0} style={{ overflow: 'hidden' }}>
      <View style={{ height: 120, backgroundColor: theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        {cover ? <Image source={{ uri: cover }} style={{ width: '100%', height: 120 }} contentFit="cover" /> : <Ionicons name="book" size={40} color={theme.colors.primary} />}
      </View>
      <View style={{ padding: theme.spacing.lg, gap: 4 }}>
        <Text variant="subheading">{title}</Text>
        {description ? (
          <Text color="textMuted" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        <Badge label={`${lessonCount} ${t('admin.lessons')}`} />
      </View>
    </Card>
  );
}
