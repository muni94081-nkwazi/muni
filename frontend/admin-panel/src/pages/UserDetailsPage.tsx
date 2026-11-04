import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { UserDetails } from '../components/users/UserDetails';
import { Button } from '../components/common/Button/Button';

export const UserDetailsPage: React.FC = () => {
  const { id } = useParams();
  const nav = useNavigate();
  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <Button variant="ghost" onClick={() => nav(-1)}>← Back</Button>
      <h1 style={{ marginTop: 'var(--space-4)' }}>User Details</h1>
      <UserDetails userId={id} />
    </div>
  );
};
