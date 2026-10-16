import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Card, EmptyState, ListItem, Screen, Text, useTheme } from '../../../ui';
import { client, unwrap } from '../../../lib/data/client';
import { useLessons } from '../../../features/ops';
import { useSignedUrl } from '../../../lib/storage/s3';

export default function CourseDetail() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const id = String(courseId);
  const { t } = useTranslation();
  const theme = useTheme();
  const course = useQuery({ queryKey: ['course', id], queryFn: async () => unwrap(await client.models.Course.get({ id }), 'course') });
  const lessons = useLessons(id);
  const [current, setCurrent] = useState<string | null>(null);
  const published = (lessons.data ?? []).filter((l) => l.published);
  const active = published.find((l) => l.id === current) ?? published[0];
  const videoUrl = useSignedUrl(active?.videoKey);

  return (
    <Screen back title={course.data?.title ?? t('admin.courses')} scroll>
      {active?.videoKey ? <LessonVideo url={videoUrl} /> : null}
      {course.data?.description ? <Text color="textMuted" style={{ marginVertical: theme.spacing.md }}>{course.data.description}</Text> : null}
      {published.length === 0 ? (
        <EmptyState icon="videocam-off-outline" title={t('student.coursesEmptyTitle')} body={t('student.coursesEmptyBody')} compact />
      ) : (
        <Card padding={0}>
          {published.map((l) => (
            <ListItem key={l.id} title={`${l.order}. ${l.title}`} subtitle={l.description ?? undefined} selected={active?.id === l.id} icon="play-circle-outline" onPress={() => setCurrent(l.id)} />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function LessonVideo({ url }: { url?: string }) {
  const theme = useTheme();
  const player = useVideoPlayer(url ? { uri: url } : null, (p) => {
    p.loop = false;
  });
  return (
    <View style={{ borderRadius: theme.radius.lg, overflow: 'hidden', backgroundColor: '#000', aspectRatio: 16 / 9 }}>
      <VideoView player={player} style={{ width: '100%', height: '100%' }} nativeControls fullscreenOptions={{ enable: true }} />
    </View>
  );
}
